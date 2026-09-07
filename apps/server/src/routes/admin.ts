// Admin moderation endpoints
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { validateCuid } from "../middleware/validateCuid";
import { db } from "../prisma/db";
import { sendResourcePublishedEmail } from "../lib/email";

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

      const total = resources.length;

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
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  }
);

// PATCH /admin/resources/:id/status - Update resource status
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

      const resource = await db.orm.public.Resource.where({ id: resourceId }).first();

      if (!resource) {
        res.status(404).json({ error: "Resource not found" });
        return;
      }

      await db.orm.public.Resource.where({ id: resourceId }).update({ status });

      // Send notification if published
      if (status === "PUBLISHED" && resource.status !== "PUBLISHED") {
        const seller = await db.orm.public.User.where({ id: resource.sellerId }).first();

        if (seller && seller.email) {
          sendResourcePublishedEmail(seller.email, resource.title, resource.slug).catch((err) =>
            console.error("Failed to send published email:", err)
          );
        }
      }

      res.json({
        message: "Resource status updated",
        status,
        reason,
      });
    } catch (error) {
      console.error("Error updating resource status:", error);
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

      const total = users.length;

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
      console.error("Error fetching users:", error);
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
      console.error("Error updating user status:", error);
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
      console.error("Error updating user role:", error);
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
      console.error("Error deleting review:", error);
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
      // Get counts (simplified - in production use aggregations)
      const users = await db.orm.public.User.all();
      const resources = await db.orm.public.Resource.all();
      const purchases = await db.orm.public.Purchase.all();
      const reviews = await db.orm.public.Review.all();

      const stats = {
        users: {
          total: users.length,
          active: users.filter((u) => u.status === "ACTIVE").length,
          banned: users.filter((u) => u.status === "BANNED").length,
        },
        resources: {
          total: resources.length,
          published: resources.filter((r) => r.status === "PUBLISHED").length,
          draft: resources.filter((r) => r.status === "DRAFT").length,
          pendingReview: resources.filter((r) => r.status === "PENDING_REVIEW").length,
          suspended: resources.filter((r) => r.status === "SUSPENDED").length,
        },
        purchases: {
          total: purchases.length,
          completed: purchases.filter((p) => p.status === "COMPLETED").length,
          pending: purchases.filter((p) => p.status === "PENDING").length,
        },
        reviews: {
          total: reviews.length,
          averageRating:
            reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0,
        },
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  }
);

export default router;
