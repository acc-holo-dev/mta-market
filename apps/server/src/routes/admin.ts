// Admin moderation endpoints
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { validateCuid } from "../middleware/validateCuid";
import { db } from "../prisma/db";
import { sendResourcePublishedEmail } from "../lib/email";
import { isResourceStatus, isTransitionAllowed, type ResourceStatus } from "../lib/moderation";
import { hasValidSignature } from "../lib/artifact/signing";
import { getSandboxRun } from "../lib/sandbox/service";
import { reqLog } from "../middleware/requestId";

const router: Router = Router();

// Middleware: Admin only
function adminOnly(req: AuthRequest, res: Response, next: () => void) {
  if (req.user?.role !== "ADMIN" && req.user?.role !== "MODERATOR") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// GET /admin/resources - List all resources (pending moderation)
router.get(
  "/resources",
  authenticate,
  adminOnly,
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const { status = "DRAFT", page = "1", limit = "20" } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);
      const skip = (pageNum - 1) * limitNum;

      const resources = await db.orm.public.Resource.where({ status: status as any })
        .orderBy((m) => m.createdAt.desc())
        .limit(limitNum)
        .offset(skip)
        .all();

      // PLAN B-004: honest total via COUNT aggregate.
      const countResult = await db.orm.public.Resource.where({ status: status as any }).aggregate(
        (agg: any) => ({ total: agg.count() })
      );
      const total = Number(countResult.total);

      res.json({
        data: resources,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      reqLog(req).error("admin_resources_fetch_failed", { error });
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  }
);

// PATCH /admin/resources/:id/status - Update resource status (moderation)
router.patch(
  "/resources/:id/status",
  authenticate,
  adminOnly,
  validateCuid('id'),
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const resourceId = req.params.id as string;
      const { status, reason } = req.body;

      if (!status) {
        res.status(400).json({ error: "Status is required" });
        return;
      }

      // TASK A-008: status must be a valid enum value and the transition
      // must be allowed by the moderation state machine (J-001).
      if (!isResourceStatus(status)) {
        res.status(400).json({ error: `Invalid status. Allowed: DRAFT, PENDING_REVIEW, PUBLISHED, SUSPENDED` });
        return;
      }

      const resource = await db.orm.public.Resource.where({ id: resourceId }).first();

      if (!resource) {
        res.status(404).json({ error: "Resource not found" });
        return;
      }

      const from = resource.status as ResourceStatus;
      if (!isTransitionAllowed(from, status, "admin")) {
        res.status(400).json({
          error: "Invalid status transition",
          message: `Transition ${from} -> ${status} is not allowed for moderators.`,
        });
        return;
      }

      // PLAN B-001 publication gate: a version may only go PUBLISHED when
      // every version of the resource is signed and passed validation
      // (sandbox execution may be PENDING when Docker is unavailable —
      // manual review path — but FAILED validation blocks publication).
      if (status === "PUBLISHED") {
        const versions = await db.orm.public.ResourceVersion.where({ resourceId }).all();
        for (const version of versions) {
          const signed = await hasValidSignature(version.id);
          if (!signed) {
            res.status(409).json({
              error: "Version is not signed",
              message: `Version ${version.version} has no valid artifact signature. Re-upload the artifact to sign it.`,
              version: version.version,
            });
            return;
          }

          const run = await getSandboxRun(version.id);
          if (run && run.status === "FAILED") {
            res.status(409).json({
              error: "Version failed validation",
              message: `Version ${version.version} failed sandbox/static validation and cannot be published.`,
              version: version.version,
            });
            return;
          }
        }
      }

      await db.orm.public.Resource.where({ id: resourceId }).update({ status });

      // Send notification if published
      if (status === "PUBLISHED" && resource.status !== "PUBLISHED") {
        const seller = await db.orm.public.User.where({ id: resource.sellerId }).first();

        if (seller && seller.email) {
          sendResourcePublishedEmail(seller.email, resource.title, resource.slug).catch((err) =>
            reqLog(req).error("published_email_send_failed", {
              resource_id: resource.id,
              slug: resource.slug,
              error: err,
            })
          );
        }
      }

      res.json({
        message: "Resource status updated",
        from,
        status,
        reason,
      });
    } catch (error) {
      reqLog(req).error("admin_resource_status_update_failed", { error });
      res.status(500).json({ error: "Failed to update resource status" });
    }
  }
);

// GET /admin/users - List all users
router.get(
  "/users",
  authenticate,
  adminOnly,
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const { status, page = "1", limit = "20" } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);
      const skip = (pageNum - 1) * limitNum;

      let users;
      if (status) {
        users = await db.orm.public.User.where({ status: status as any })
          .orderBy((m) => m.createdAt.desc())
          .limit(limitNum)
          .offset(skip)
          .all();
      } else {
        users = await db.orm.public.User.orderBy((m) => m.createdAt.desc())
          .limit(limitNum)
          .offset(skip)
          .all();
      }

      // PLAN B-004: honest total via COUNT aggregate.
      const countQuery = status
        ? db.orm.public.User.where({ status: status as any })
        : db.orm.public.User.where({});
      const countResult = await countQuery.aggregate((agg: any) => ({ total: agg.count() }));
      const total = Number(countResult.total);

      res.json({
        data: users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      reqLog(req).error("admin_users_fetch_failed", { error });
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }
);

// PATCH /admin/users/:id/status - Update user status
router.patch(
  "/users/:id/status",
  authenticate,
  adminOnly,
  validateCuid('id'),
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id as string;
      const { status, reason } = req.body;

      if (!status) {
        res.status(400).json({ error: "Status is required" });
        return;
      }

      const user = await db.orm.public.User.where({ id: userId }).first();

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (user.role === "ADMIN" && req.user!.role !== "ADMIN") {
        res.status(403).json({ error: "Cannot modify admin users" });
        return;
      }

      await db.orm.public.User.where({ id: userId }).update({ status });

      res.json({
        message: "User status updated",
        status,
        reason,
      });
    } catch (error) {
      reqLog(req).error("admin_user_status_update_failed", { error });
      res.status(500).json({ error: "Failed to update user status" });
    }
  }
);

// PATCH /admin/users/:id/role - Update user role
router.patch(
  "/users/:id/role",
  authenticate,
  adminOnly,
  validateCuid('id'),
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id as string;
      const { role } = req.body;

      if (!role) {
        res.status(400).json({ error: "Role is required" });
        return;
      }

      // Only ADMIN can change roles
      if (req.user!.role !== "ADMIN") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const user = await db.orm.public.User.where({ id: userId }).first();

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      await db.orm.public.User.where({ id: userId }).update({ role });

      res.json({
        message: "User role updated",
        role,
      });
    } catch (error) {
      reqLog(req).error("admin_user_role_update_failed", { error });
      res.status(500).json({ error: "Failed to update user role" });
    }
  }
);

// DELETE /admin/reviews/:id - Delete review
router.delete(
  "/reviews/:id",
  authenticate,
  adminOnly,
  validateCuid('id'),
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const reviewId = req.params.id as string;

      const review = await db.orm.public.Review.where({ id: reviewId }).first();

      if (!review) {
        res.status(404).json({ error: "Review not found" });
        return;
      }

      await db.orm.public.Review.where({ id: reviewId }).delete();

      res.json({ message: "Review deleted successfully" });
    } catch (error) {
      reqLog(req).error("admin_review_delete_failed", { error });
      res.status(500).json({ error: "Failed to delete review" });
    }
  }
);

// GET /admin/stats - Get platform statistics
router.get(
  "/stats",
  authenticate,
  adminOnly,
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      // PLAN B-005: aggregates in the database (COUNT/GROUP BY) instead of
      // full table loads. The endpoint is rate-limited (standardRateLimit).
      // Runtime groupBy returns [{ <groupKeys>, n }], but the static ORM
      // typing models groupBy rows as full table rows, so the chain is
      // intentionally loosened here (verified against a live DB in
      // scripts/db-check.ts).
      const groupCounts = async (model: unknown, column: string): Promise<Record<string, number>> => {
        const rows = await (model as {
          groupBy: (cols: string[]) => {
            aggregate: (
              fn: (agg: Record<string, (...args: unknown[]) => unknown>) => Record<string, unknown>
            ) => Promise<Array<Record<string, unknown>>>;
          };
        }).groupBy([column]).aggregate((agg) => ({ n: agg.count() }));
        const map: Record<string, number> = {};
        for (const row of rows) map[String(row.status)] = Number(row.n);
        return map;
      };

      const userCounts = await groupCounts(db.orm.public.User, "status");
      const resourceCounts = await groupCounts(db.orm.public.Resource, "status");
      const purchaseCounts = await groupCounts(db.orm.public.Purchase, "status");
      const reviewAgg = await db.orm.public.Review.aggregate((agg: any) => ({
        total: agg.count(),
        averageRating: agg.avg("rating"),
      }));

      const stats = {
        users: {
          total: Number(userCounts.ACTIVE ?? 0) + Number(userCounts.SUSPENDED ?? 0) + Number(userCounts.BANNED ?? 0),
          active: Number(userCounts.ACTIVE ?? 0),
          banned: Number(userCounts.BANNED ?? 0),
        },
        resources: {
          total:
            Number(resourceCounts.DRAFT ?? 0) +
            Number(resourceCounts.PENDING_REVIEW ?? 0) +
            Number(resourceCounts.PUBLISHED ?? 0) +
            Number(resourceCounts.SUSPENDED ?? 0),
          published: Number(resourceCounts.PUBLISHED ?? 0),
          draft: Number(resourceCounts.DRAFT ?? 0),
          pendingReview: Number(resourceCounts.PENDING_REVIEW ?? 0),
          suspended: Number(resourceCounts.SUSPENDED ?? 0),
        },
        purchases: {
          total:
            Number(purchaseCounts.PENDING ?? 0) +
            Number(purchaseCounts.COMPLETED ?? 0) +
            Number(purchaseCounts.REFUNDED ?? 0) +
            Number(purchaseCounts.DISPUTED ?? 0) +
            Number(purchaseCounts.FAILED ?? 0),
          completed: Number(purchaseCounts.COMPLETED ?? 0),
          pending: Number(purchaseCounts.PENDING ?? 0),
        },
        reviews: {
          total: Number(reviewAgg.total ?? 0),
          averageRating: Math.round(Number(reviewAgg.averageRating ?? 0) * 10) / 10,
        },
      };

      res.json(stats);
    } catch (error) {
      reqLog(req).error("admin_stats_fetch_failed", { error });
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  }
);

export default router;
