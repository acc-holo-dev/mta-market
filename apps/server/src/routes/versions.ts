// Resource Versions API routes
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { db } from "../prisma/db";
import { S3_ENABLED, getS3DownloadUrl, SIGNED_URL_TTL } from "../lib/s3";

const router: Router = Router();

// GET /resources/:slug/versions - List versions of a resource
router.get("/:slug/versions", standardRateLimit, async (req, res: Response) => {
  try {
    const slug = req.params.slug as string;

    const resource = await db.orm.public.Resource.where({ slug }).first();

    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    if (resource.status !== "PUBLISHED") {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    const versions = await db.orm.public.ResourceVersion.where({ resourceId: resource.id })
      .orderBy((m) => m.publishedAt.desc())
      .all();

    res.json(versions);
  } catch (error) {
    console.error("Error fetching versions:", error);
    res.status(500).json({ error: "Failed to fetch versions" });
  }
});

// POST /resources/:slug/versions - Create new version (authenticated, owner only)
router.post(
  "/:slug/versions",
  authenticate,
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const slug = req.params.slug as string;
      const { version, changelog, fileUrl, fileSize, fileChecksum } = req.body;

      if (!version || !fileUrl || !fileSize || !fileChecksum) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      const resource = await db.orm.public.Resource.where({ slug }).first();

      if (!resource) {
        res.status(404).json({ error: "Resource not found" });
        return;
      }

      if (resource.sellerId !== req.user!.userId) {
        res.status(403).json({ error: "Not authorized" });
        return;
      }

      // Check if version already exists
      const existing = await db.orm.public.ResourceVersion.where({
        resourceId: resource.id,
        version,
      }).first();

      if (existing) {
        res.status(409).json({ error: "Version already exists" });
        return;
      }

      const newVersion = await db.orm.public.ResourceVersion.create({
        resourceId: resource.id,
        version,
        changelog: changelog || null,
        fileUrl,
        fileSize,
        fileChecksum,
      });

      res.status(201).json(newVersion);
    } catch (error) {
      console.error("Error creating version:", error);
      res.status(500).json({ error: "Failed to create version" });
    }
  }
);

// GET /resources/:slug/versions/:version/download - Download version (authenticated, purchased only)
router.get(
  "/:slug/versions/:version/download",
  authenticate,
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const slug = req.params.slug as string;
      const version = req.params.version as string;

      const resource = await db.orm.public.Resource.where({ slug }).first();

      if (!resource) {
        res.status(404).json({ error: "Resource not found" });
        return;
      }

      const resourceVersion = await db.orm.public.ResourceVersion.where({
        resourceId: resource.id,
        version,
      }).first();

      if (!resourceVersion) {
        res.status(404).json({ error: "Version not found" });
        return;
      }

      // Check if user purchased this resource
      const purchase = await db.orm.public.Purchase.where({
        buyerId: req.user!.userId,
        resourceId: resource.id,
        status: "COMPLETED",
      }).first();

      if (!purchase) {
        res.status(403).json({ error: "Purchase required to download" });
        return;
      }

      // SECURITY: Generate short-lived signed URL (never expose public URLs for paid artifacts)
      // fileUrl stores the S3 object key for S3 storage, or a local /uploads path for dev storage
      let downloadUrl: string;

      if (S3_ENABLED) {
        // fileUrl contains the S3 object key
        downloadUrl = await getS3DownloadUrl(resourceVersion.fileUrl);
      } else {
        // Local development storage: fileUrl is /uploads/<filename>
        // Served through authenticated proxy in production; direct link acceptable for dev only
        downloadUrl = resourceVersion.fileUrl;
      }

      res.json({
        downloadUrl,
        version: resourceVersion.version,
        fileSize: resourceVersion.fileSize,
        checksum: resourceVersion.fileChecksum,
        expiresIn: S3_ENABLED ? SIGNED_URL_TTL : null,
      });
    } catch (error) {
      console.error("Error getting download URL:", error);
      res.status(500).json({ error: "Failed to get download URL" });
    }
  }
);

export default router;
