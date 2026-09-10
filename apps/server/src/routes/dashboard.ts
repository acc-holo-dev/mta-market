// PLAN-005 Workstream N: dashboard community data. Uses the existing
// dashboard (no new dashboard) — this endpoint feeds the new widgets:
// owned servers, followed servers, forum activity, unread notifications.
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { db } from "../prisma/db";
import { reqLog } from "../middleware/requestId";
import { unreadNotificationCount } from "../lib/notify";

const router: Router = Router();

// GET /dashboard/community — widget payload for My MTA.
router.get("/community", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    // My servers (owner role) with live state.
    const memberships = await db.orm.public.ServerMember
      .where({ userId: req.user!.userId, role: "OWNER" })
      .all();
    const ownedIds = memberships.map((m: any) => m.serverId as string);
    const ownedServers = ownedIds.length
      ? await db.orm.public.Server
          .where((s: any) => s.id.in(ownedIds))
          .orderBy((s: any) => s.updatedAt.desc())
          .limit(6)
          .all()
      : [];

    // Followed servers with their latest activity.
    const follows = await db.orm.public.ServerFollow
      .where({ userId: req.user!.userId })
      .orderBy((f: any) => f.createdAt.desc())
      .limit(20)
      .all();
    const followedIds = follows.map((f: any) => f.serverId as string);
    const followedServers = followedIds.length
      ? await db.orm.public.Server
          .where((s: any) => s.id.in(followedIds))
          .select("id", "slug", "name", "logoUrl", "monitoring", "playerCount")
          .all()
      : [];

    const followedServerIds = followedServers.map((s: any) => s.id as string);
    const latestNews = followedServerIds.length
      ? await db.orm.public.ServerNews
          .where((n: any) => n.serverId.in(followedServerIds))
          .where({ status: "PUBLISHED" })
          .orderBy((n: any) => (n.publishedAt ?? n.createdAt).desc())
          .limit(10)
          .all()
      : [];
    const latestUpdates = followedServerIds.length
      ? await db.orm.public.ServerUpdate
          .where((u: any) => u.serverId.in(followedServerIds))
          .orderBy((u: any) => u.publishedAt.desc())
          .limit(10)
          .all()
      : [];
    const newsServerById = new Map(
      (
        await db.orm.public.Server
          .where((s: any) => s.id.in(Array.from(new Set(latestNews.map((n: any) => n.serverId as string)))))
          .select("id", "slug", "name")
          .all()
      ).map((s: any) => [s.id, s])
    );

    // Forum activity: threads the user authored, with fresh replies.
    const myThreads = await db.orm.public.ForumThread
      .where({ authorId: req.user!.userId })
      .orderBy((t: any) => (t.lastPostAt ?? t.createdAt).desc())
      .limit(6)
      .all();

    const unread = await unreadNotificationCount(req.user!.userId);

    res.json({
      ownedServers: ownedServers.map((s: any) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        monitoring: s.monitoring,
        playerCount: s.showStats ? s.playerCount : null,
        maxPlayers: s.showStats ? s.maxPlayers : null,
        lifecycle: s.lifecycle,
        verification: s.verification,
      })),
      following: followedServers.map((s: any) => ({
        slug: s.slug,
        name: s.name,
        monitoring: s.monitoring,
      })),
      followedNews: latestNews.map((n: any) => ({
        id: n.id,
        title: n.title,
        server: newsServerById.get(n.serverId) ?? null,
        publishedAt: n.publishedAt ?? n.createdAt,
      })),
      updates: latestUpdates.map((u: any) => ({
        id: u.id,
        version: u.version,
        title: u.title,
        serverSlug: followedServers.find((s: any) => s.id === u.serverId)?.slug ?? null,
        publishedAt: u.publishedAt,
      })),
      discussions: myThreads.map((t: any) => ({
        id: t.id,
        title: t.title,
        replyCount: t.replyCount,
        lastPostAt: t.lastPostAt,
        state: t.state,
      })),
      unreadNotifications: unread,
    });
  } catch (error) {
    reqLog(req).error("dashboard_community_failed", { error });
    res.status(500).json({ error: "Failed to fetch community dashboard" });
  }
});

export default router;