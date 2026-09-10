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
import {
  isResourceStatus,
  isTransitionAllowed,
  RESOURCE_STATUSES,
  type ResourceStatus,
} from "../lib/moderation";
import { canCreateListings, sellerGateMessage } from "../lib/permissions";
import { reqLog } from "../middleware/requestId";

const router: Router = Router();

// PLAN-002 E-006/E-007: карточка товара и product page должны показывать
// продавца и рейтинг. Минимальная аддитивная поддержка UI (без новой media
// subsystem): к каждому ресурсу добавляются seller {username, displayName,
// avatar}, rating и reviewCount. Additive fields — существующий контракт
// не меняется.
async function enrichResourceCard(resource: any): Promise<any> {
  const [seller, reviewAgg] = await Promise.all([
    db.orm.public.User.where({ id: resource.sellerId }).first(),
    db.orm.public.Review.where({ resourceId: resource.id }).aggregate((agg: any) => ({
      total: agg.count(),
      averageRating: agg.avg("rating"),
    })),
  ]);
  return {
    ...resource,
    seller: seller
      ? { username: seller.username, displayName: seller.displayName, avatar: seller.avatar }
      : null,
    rating:
      reviewAgg && Number(reviewAgg.total) > 0
        ? Math.round(Number(reviewAgg.averageRating) * 10) / 10
        : null,
    reviewCount: reviewAgg ? Number(reviewAgg.total) : 0,
  };
}

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

      // PLAN B-004: total is the collection size (COUNT), never page.length.
      const countResult = await db.orm.public.Resource.where({ status: "PUBLISHED" }).aggregate(
        (agg: any) => ({ total: agg.count() })
      );
      const total = Number(countResult.total);

      const enriched = await Promise.all(resources.map((r: any) => enrichResourceCard(r)));

      res.json({
        data: enriched,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      reqLog(req).error("resources_fetch_failed", { error });
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  }
);

// GET /resources/my - Seller's own resources (PLAN M-002; must precede /:slug)
router.get("/my", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const resources = await db.orm.public.Resource.where({ sellerId: req.user!.userId })
      .orderBy((m) => m.createdAt.desc())
      .all();
    res.json({ data: resources, total: resources.length });
  } catch (error) {
    reqLog(req).error("resources_my_fetch_failed", { error });
    res.status(500).json({ error: "Failed to fetch own resources" });
  }
});

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

    res.json(await enrichResourceCard(resource));
  } catch (error) {
    reqLog(req).error("resource_fetch_failed", { error });
    res.status(500).json({ error: "Failed to fetch resource" });
  }
});

// POST /resources - Create new resource (seller-gated, PLAN L-002)
router.post(
  "/",
  authenticate,
  standardRateLimit,
  validate(createResourceSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      // PLAN L-002: listing creation requires an APPROVED seller profile.
      if (!(await canCreateListings({ userId: req.user!.userId, role: req.user!.role as "USER" | "ADMIN" | "MODERATOR" }))) {
        res.status(403).json({ error: sellerGateMessage(), code: "seller_approval_required" });
        return;
      }

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
      reqLog(req).error("resource_create_failed", { error });
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

    // TASK A-008: sellers may only submit (DRAFT -> PENDING_REVIEW) or
    // withdraw (PENDING_REVIEW -> DRAFT). Publishing, suspending, unsuspending
    // and unpublishing are moderation-only — transition matrix, not a blocklist
    // (the old allowlist let sellers "unsuspend" via SUSPENDED -> DRAFT).
    if (status) {
      if (!isResourceStatus(status)) {
        res.status(400).json({ error: `Invalid status. Allowed: DRAFT, PENDING_REVIEW` });
        return;
      }

      const from = resource.status as ResourceStatus;
      if (!isTransitionAllowed(from, status, "seller")) {
        reqLog(req).warn("resource_status_transition_denied", {
          user_id: req.user!.userId,
          from,
          to: status,
          resource_id: resource.id,
        });
        res.status(403).json({
          error: "Forbidden status transition",
          message: `Sellers may only submit (DRAFT -> PENDING_REVIEW) or withdraw (PENDING_REVIEW -> DRAFT). Current status: ${from}.`,
        });
        return;
      }

      updateData.status = status;
    }

    const updated = await db.orm.public.Resource.where({ id: resource.id }).update(updateData);

    res.json(updated);
  } catch (error) {
    reqLog(req).error("resource_update_failed", { error });
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
      reqLog(req).error("resource_delete_failed", { error });
      res.status(500).json({ error: "Failed to delete resource" });
    }
  }
);

export default router;
