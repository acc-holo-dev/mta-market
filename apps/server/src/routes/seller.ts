// Seller onboarding + profile API (PLAN L-001/L-003).
// Lifecycle: POST /seller/apply (PENDING) -> moderator APPROVES or REJECTS
// (admin routes) -> APPROVED sellers gain listing capabilities (L-002) and
// payout eligibility. Sellers cannot alter platform-controlled financial or
// moderation state (L-003): the write surface here is limited to profile
// fields and is always re-reviewed on change.
import { Router, Response } from "express";
import { authenticate, AuthRequest, requireRole } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { db } from "../prisma/db";
import { recordAudit } from "../lib/audit";
import { reqLog } from "../middleware/requestId";

const router: Router = Router();

// GET /seller/profile - current user's seller profile (L-001)
router.get("/profile", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await db.orm.public.SellerProfile
      .where({ userId: req.user!.userId })
      .first();
    res.json({ profile: profile ?? null });
  } catch (error) {
    reqLog(req).error("seller_profile_fetch_failed", { error });
    res.status(500).json({ error: "Failed to fetch seller profile" });
  }
});

// POST /seller/apply - apply for seller onboarding (L-001)
router.post("/apply", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { displayName, supportInfo } = req.body ?? {};
    const existing = await db.orm.public.SellerProfile
      .where({ userId: req.user!.userId })
      .first();
    if (existing) {
      res.status(409).json({ error: "Seller application already exists", profile: existing });
      return;
    }
    const profile = await db.orm.public.SellerProfile.create({
      userId: req.user!.userId,
      status: "PENDING",
      displayName: displayName ?? null,
      supportInfo: supportInfo ?? null,
      payoutEnabled: false,
    });
    reqLog(req).info("seller_application_submitted", { user_id: req.user!.userId });
    res.status(201).json(profile);
  } catch (error) {
    reqLog(req).error("seller_apply_failed", { error });
    res.status(500).json({ error: "Failed to submit seller application" });
  }
});

// PATCH /seller/profile - update own profile fields (L-003).
// Re-approved sellers editing their public info keep their status; the edit
// is logged for moderators. payoutEnabled is platform-controlled (ignored).
router.patch("/profile", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await db.orm.public.SellerProfile
      .where({ userId: req.user!.userId })
      .first();
    if (!profile) {
      res.status(404).json({ error: "No seller profile" });
      return;
    }
    const updates: Record<string, unknown> = {};
    for (const key of ["displayName", "supportInfo"] as const) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No editable fields provided" });
      return;
    }
    const updated = await db.orm.public.SellerProfile.where({ id: profile.id }).update(updates);
    reqLog(req).info("seller_profile_updated", { user_id: req.user!.userId });
    res.json(updated);
  } catch (error) {
    reqLog(req).error("seller_profile_update_failed", { error });
    res.status(500).json({ error: "Failed to update seller profile" });
  }
});

// ---- moderator-facing (mounted here for cohesion; role-gated) ----

// GET /seller/list?status - list seller applications (ADMIN/MODERATOR)
router.get("/list", authenticate, requireRole("ADMIN"), standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const status = (req.query.status as string) || "PENDING";
    const profiles = await db.orm.public.SellerProfile.where({
      status: status as "PENDING" | "APPROVED" | "REJECTED",
    })
      .orderBy((m) => m.appliedAt.desc())
      .all();
    res.json({ data: profiles, total: profiles.length });
  } catch (error) {
    reqLog(req).error("seller_list_failed", { error });
    res.status(500).json({ error: "Failed to list seller profiles" });
  }
});

// POST /seller/:userId/approve - APPROVED + payoutEnabled (ADMIN)
router.post("/:userId/approve", authenticate, requireRole("ADMIN"), standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await db.orm.public.SellerProfile
      .where({ userId: req.params.userId as string })
      .first();
    if (!profile) {
      res.status(404).json({ error: "Seller profile not found" });
      return;
    }
    const updated = await db.orm.public.SellerProfile.where({ id: profile.id }).update({
      status: "APPROVED",
      payoutEnabled: true,
      reviewedAt: new Date().toISOString(),
      reviewedBy: req.user!.userId,
      rejectionReason: null,
    });
    await recordAudit({
      actorId: req.user!.userId,
      action: "seller.approve",
      targetType: "seller_profile",
      targetId: profile.id,
      after: { status: "APPROVED", payoutEnabled: true },
      ip: req.ip,
      requestId: req.id,
    });
    reqLog(req).info("seller_approved", {
      user_id: req.params.userId,
      admin_id: req.user!.userId,
    });
    res.json(updated);
  } catch (error) {
    reqLog(req).error("seller_approve_failed", { error });
    res.status(500).json({ error: "Failed to approve seller" });
  }
});

// POST /seller/:userId/reject - REJECTED with reason (ADMIN)
router.post("/:userId/reject", authenticate, requireRole("ADMIN"), standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const reason = req.body?.reason;
    if (!reason) {
      res.status(400).json({ error: "reason is required" });
      return;
    }
    const profile = await db.orm.public.SellerProfile
      .where({ userId: req.params.userId as string })
      .first();
    if (!profile) {
      res.status(404).json({ error: "Seller profile not found" });
      return;
    }
    const updated = await db.orm.public.SellerProfile.where({ id: profile.id }).update({
      status: "REJECTED",
      payoutEnabled: false,
      reviewedAt: new Date().toISOString(),
      reviewedBy: req.user!.userId,
      rejectionReason: reason,
    });
    await recordAudit({
      actorId: req.user!.userId,
      action: "seller.reject",
      targetType: "seller_profile",
      targetId: profile.id,
      after: { status: "REJECTED", reason },
      ip: req.ip,
      requestId: req.id,
    });
    reqLog(req).warn("seller_rejected", {
      user_id: req.params.userId,
      admin_id: req.user!.userId,
      reason,
    });
    res.json(updated);
  } catch (error) {
    reqLog(req).error("seller_reject_failed", { error });
    res.status(500).json({ error: "Failed to reject seller" });
  }
});

export default router;
