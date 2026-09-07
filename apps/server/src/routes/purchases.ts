// Purchase API routes (buying resources)
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { db } from "../prisma/db";
import crypto from "crypto";

const router: Router = Router();

// POST /purchases - Create purchase (authenticated)
router.post("/", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { resourceSlug, versionId } = req.body;

    if (!resourceSlug) {
      res.status(400).json({ error: "Missing resource slug" });
      return;
    }

    // Get resource
    const resource = await db.orm.public.Resource.where({ slug: resourceSlug }).first();

    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    if (resource.status !== "PUBLISHED") {
      res.status(400).json({ error: "Resource is not available for purchase" });
      return;
    }

    // Check if user already purchased this resource
    const existingPurchase = await db.orm.public.Purchase.where({
      buyerId: req.user!.userId,
      resourceId: resource.id,
    }).first();

    if (existingPurchase && existingPurchase.status === "COMPLETED") {
      res.status(409).json({ error: "You already own this resource" });
      return;
    }

    // Get version (latest if not specified)
    let version;
    if (versionId) {
      version = await db.orm.public.ResourceVersion.where({
        id: versionId,
        resourceId: resource.id,
      }).first();
    } else {
      // Get latest version
      const versions = await db.orm.public.ResourceVersion.where({ resourceId: resource.id })
        .orderBy((m) => m.publishedAt.desc())
        .limit(1)
        .all();
      version = versions[0];
    }

    if (!version) {
      res.status(404).json({ error: "Version not found" });
      return;
    }

    // Calculate fees
    const priceSnapshot = resource.price;
    const platformFee = Math.round(priceSnapshot * 0.1); // 10% platform fee
    const sellerRevenue = priceSnapshot - platformFee;

    // Generate payment ID
    const paymentId = crypto.randomBytes(16).toString("hex");

    // Create purchase
    const purchase = await db.orm.public.Purchase.create({
      buyerId: req.user!.userId,
      resourceId: resource.id,
      versionId: version.id,
      paymentId,
      status: "PENDING",
      priceSnapshot,
      platformFee,
      sellerRevenue,
    });

    // In production, this would redirect to payment gateway (YooKassa)
    // For now, return payment info
    res.status(201).json({
      purchaseId: purchase.id,
      paymentId: purchase.paymentId,
      amount: priceSnapshot,
      currency: "RUB",
      status: "pending",
      // In production: paymentUrl for redirect to YooKassa
      message: "Payment integration pending - purchase created",
    });
  } catch (error) {
    console.error("Error creating purchase:", error);
    res.status(500).json({ error: "Failed to create purchase" });
  }
});

// GET /purchases/my - Get user's purchases (authenticated)
router.get("/my", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const purchases = await db.orm.public.Purchase.where({ buyerId: req.user!.userId })
      .orderBy((m) => m.createdAt.desc())
      .all();

    // Enrich with resource info
    const enriched = [];
    for (const purchase of purchases) {
      const resource = await db.orm.public.Resource.where({ id: purchase.resourceId }).first();

      const version = await db.orm.public.ResourceVersion.where({ id: purchase.versionId }).first();

      enriched.push({
        id: purchase.id,
        status: purchase.status,
        priceSnapshot: purchase.priceSnapshot,
        createdAt: purchase.createdAt,
        completedAt: purchase.completedAt,
        resource: resource
          ? {
              slug: resource.slug,
              title: resource.title,
              type: resource.type,
            }
          : null,
        version: version
          ? {
              version: version.version,
            }
          : null,
      });
    }

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching purchases:", error);
    res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

// GET /purchases/:id - Get purchase details (authenticated, owner only)
router.get("/:id", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const purchaseId = parseInt(req.params.id as string, 10);

    const purchase = await db.orm.public.Purchase.where({ id: purchaseId }).first();

    if (!purchase) {
      res.status(404).json({ error: "Purchase not found" });
      return;
    }

    if (purchase.buyerId !== req.user!.userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    // Get resource and version info
    const resource = await db.orm.public.Resource.where({ id: purchase.resourceId }).first();

    const version = await db.orm.public.ResourceVersion.where({ id: purchase.versionId }).first();

    // Get license if purchase is completed
    let license = null;
    if (purchase.status === "COMPLETED") {
      license = await db.orm.public.License.where({ purchaseId: purchase.id }).first();
    }

    res.json({
      ...purchase,
      resource,
      version,
      license: license
        ? {
            id: license.id,
            status: license.status,
            serverSerial: license.serverSerial,
            activatedAt: license.activatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Error fetching purchase:", error);
    res.status(500).json({ error: "Failed to fetch purchase" });
  }
});

// POST /purchases/:id/complete - REMOVED for security
// Payment completion MUST only happen via authenticated YooKassa webhook
// See /payments/webhook endpoint in payments.ts

export default router;
