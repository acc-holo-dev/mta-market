// Purchase API routes (buying resources)
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { db } from "../prisma/db";
import { validateDiscount, applyDiscount, calculateFinalPrice } from "../lib/discount";
import crypto from "crypto";
import { validate, validateParam } from "../middleware/validate";
import { createPurchaseSchema } from "../lib/validation";

const router: Router = Router();

// POST /purchases - Create purchase (authenticated)
router.post(
  "/",
  authenticate,
  standardRateLimit,
  validate(createPurchaseSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { resourceSlug } = req.body;

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

      // Get latest version (versionId selection removed for now — always use latest)
      const versions = await db.orm.public.ResourceVersion.where({ resourceId: resource.id })
        .orderBy((m) => m.publishedAt.desc())
        .limit(1)
        .all();
      const version = versions[0];

      if (!version) {
        res.status(404).json({ error: "No versions available for this resource" });
        return;
      }

      // Snapshot current price (immutable)
      const priceSnapshot = resource.price;

      // Apply discount if provided
      const { discountCode } = req.body;
      let discountId: string | null = null;
      let discountAmount = 0;

      if (discountCode && priceSnapshot > 0) {
        const validation = await validateDiscount({
          code: discountCode,
          resourceId: resource.id,
          originalPrice: priceSnapshot,
        });

        if (!validation.valid) {
          res.status(400).json({ error: validation.error });
          return;
        }

        if (validation.discount) {
          discountId = validation.discount.id;
          discountAmount = validation.discount.discountAmount;
          
          // Increment discount usage count
          await applyDiscount(discountId);
        }
      }

      // Calculate final price after discount
      const finalPrice = calculateFinalPrice(priceSnapshot, discountAmount);
      const platformFee = Math.round(finalPrice * 0.1); // 10% of final price
      const sellerRevenue = finalPrice - platformFee;

      // Generate payment ID (for paid resources)
      const paymentId = finalPrice > 0 ? crypto.randomBytes(16).toString("hex") : null;

      // Create purchase
      const purchase = await db.orm.public.Purchase.create({
        buyerId: req.user!.userId,
        resourceId: resource.id,
        versionId: version.id,
        paymentId,
        status: finalPrice === 0 ? "COMPLETED" : "PENDING", // Free/fully discounted = completed immediately
        priceSnapshot,
        discountId,
        discountSnapshot: discountAmount,
        finalPrice,
        platformFee,
        sellerRevenue,
        completedAt: finalPrice === 0 ? new Date().toISOString() : null,
      });

      // Free or fully discounted resource: grant license immediately
      if (finalPrice === 0) {
        const license = await db.orm.public.License.create({
          purchaseId: purchase.id,
          status: "ACTIVE",
        });

        // Settle revenue (even for free: track metrics)
        await settlePurchaseRevenue(purchase.id);

        res.status(201).json({
          purchaseId: purchase.id,
          licenseId: license.id,
          status: "completed",
          message: discountAmount > 0 ? "100% discount applied - free acquisition" : "Free resource acquired",
          discount: discountAmount > 0 ? {
            applied: true,
            amount: discountAmount,
            originalPrice: priceSnapshot,
            finalPrice: 0,
          } : undefined,
        });
        return;
      }

      // Paid resource: redirect to payment
      res.status(201).json({
        purchaseId: purchase.id,
        paymentId: purchase.paymentId,
        amount: finalPrice,
        originalAmount: priceSnapshot,
        currency: "RUB",
        status: "pending",
        discount: discountAmount > 0 ? {
          applied: true,
          amount: discountAmount,
          percentage: Math.round((discountAmount / priceSnapshot) * 100),
        } : undefined,
        // In production: paymentUrl for redirect to YooKassa
        message: "Payment integration pending - purchase created",
      });
    } catch (error) {
      console.error("Error creating purchase:", error);
      res.status(500).json({ error: "Failed to create purchase" });
    }
  }
);

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
router.get(
  "/:id",
  authenticate,
  standardRateLimit,
  validateParam("id", "int"),
  async (req: AuthRequest, res: Response) => {
    try {
      const purchaseId = (req as any).validatedParams.id;

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
  }
);

// POST /purchases/:id/complete - REMOVED for security
// Payment completion MUST only happen via authenticated YooKassa webhook
// See /payments/webhook endpoint in payments.ts

export default router;
