// Resources API routes (CRUD for marketplace products)
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { db } from "../prisma/db";
import { validate, validateParam } from "../middleware/validate";
import {
  createResourceSchema,
  updateResourceSchema,
  paginationSchema,
  resourceFiltersSchema,
} from "../lib/validation";

const router: Router = Router();

// GET /resources - List all published resources
router.get(
  "/",
  standardRateLimit,
  validate(paginationSchema.merge(resourceFiltersSchema), "query"),
  async (req, res: Response) => {
    try {
      const { page, limit } = req.query as any;
      const skip = (page - 1) * limit;

      // Prisma 8 uses different query API
      // TODO: Implement filtering with where() + type/search
      // For now, just get published resources

      const resources = await db.orm.public.Resource.where({ status: "PUBLISHED" })
        .orderBy((m) => m.createdAt.desc())
        .limit(limit)
        .offset(skip)
        .all();

      // Count total (simplified for now)
      const total = resources.length;

      res.json({
        data: resources,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  }
);

// GET /resources/:slug - Get resource by slug
router.get("/:slug", standardRateLimit, async (req, res: Response) => {
  try {
    const slug = req.params.slug as string;

    const resource = await db.orm.public.Resource.where({ slug }).first();

    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    // Only show published resources to non-owners
    if (resource.status !== "PUBLISHED") {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    res.json(resource);
  } catch (error) {
    console.error("Error fetching resource:", error);
    res.status(500).json({ error: "Failed to fetch resource" });
  }
});

// POST /resources - Create new resource (authenticated)
router.post(
  "/",
  authenticate,
  standardRateLimit,
  validate(createResourceSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { title, description, type, price, slug } = req.body;

      // Check slug uniqueness
      const existing = await db.orm.public.Resource.where({ slug }).first();

      if (existing) {
        res.status(409).json({ error: "Slug already exists" });
        return;
      }

      const resource = await db.orm.public.Resource.create({
        sellerId: req.user!.userId,
        slug,
        title,
        description,
        type,
        price, // Already validated as non-negative int in kopecks
        status: "DRAFT",
      });

      res.status(201).json(resource);
    } catch (error) {
      console.error("Error creating resource:", error);
      res.status(500).json({ error: "Failed to create resource" });
    }
  }
);

// PATCH /resources/:slug - Update resource (authenticated, owner only)
router.patch("/:slug", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const { title, description, price, status } = req.body;

    const resource = await db.orm.public.Resource.where({ slug }).first();

    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    if (resource.sellerId !== req.user!.userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const updateData: any = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (price !== undefined) updateData.price = Math.round(price * 100);

    // Sellers cannot directly set PUBLISHED or SUSPENDED status - only admin/moderator can
    // Allowed seller transitions: DRAFT -> PENDING_REVIEW, SUSPENDED -> PENDING_REVIEW
    if (status) {
      // Block privileged statuses
      const privilegedStatuses = ["PUBLISHED", "SUSPENDED"];
      if (privilegedStatuses.includes(status)) {
        console.warn(`Resource status bypass attempt: User ${req.user!.userId} tried to set status ${status} on resource ${resource.id}`);
        res.status(403).json({ 
          error: "Forbidden status", 
          message: "Cannot set PUBLISHED or SUSPENDED status directly. Submit for review first." 
        });
        return;
      }

      const allowedStatuses = ["DRAFT", "PENDING_REVIEW"];
      if (!allowedStatuses.includes(status)) {
        res.status(400).json({ error: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` });
        return;
      }

      updateData.status = status;
    }

    const updated = await db.orm.public.Resource.where({ id: resource.id }).update(updateData);

    res.json(updated);
  } catch (error) {
    console.error("Error updating resource:", error);
    res.status(500).json({ error: "Failed to update resource" });
  }
});

// DELETE /resources/:slug - Delete resource (authenticated, owner only)
router.delete(
  "/:slug",
  authenticate,
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const slug = req.params.slug as string;

      const resource = await db.orm.public.Resource.where({ slug }).first();

      if (!resource) {
        res.status(404).json({ error: "Resource not found" });
        return;
      }

      if (resource.sellerId !== req.user!.userId) {
        res.status(403).json({ error: "Not authorized" });
        return;
      }

      await db.orm.public.Resource.where({ id: resource.id }).delete();

      res.json({ message: "Resource deleted successfully" });
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: "Failed to delete resource" });
    }
  }
);

export default router;
