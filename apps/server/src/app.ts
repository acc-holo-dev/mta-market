// TASK A-001/A-002/A-003/A-006: Express app factory.
// Extracted from index.ts so integration tests can boot the app
// without binding a port (supertest) and so middleware wiring is
// explicit and testable.
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth";
import resourcesRoutes from "./routes/resources";
import versionsRoutes from "./routes/versions";
import reviewsRoutes from "./routes/reviews";
import drmRoutes from "./routes/drm";
import drmV2Routes from "./routes/drm/v2";
import purchasesRoutes from "./routes/purchases";
import uploadRoutes from "./routes/upload";
import paymentsRoutes from "./routes/payments";
import adminRoutes from "./routes/admin";
import { standardRateLimit } from "./lib/rateLimit";

/**
 * Allowed browser origins for cross-origin credentialed requests.
 *
 * TASK A-003 topology decision:
 * - production: same-origin behind nginx (`/api/` -> backend), so the
 *   browser never issues a cross-origin request; CORS stays closed by
 *   default (empty allowlist = no cross-origin access).
 * - development: web :3000 -> api :3001 is cross-origin, so the allowlist
 *   must explicitly contain the web origin (CORS_ORIGINS env).
 *
 * Wildcard origins are forbidden with credentials (browser spec and plan).
 */
function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function createApp(): Express {
  const app = express();

  // Behind nginx (docker-compose.prod / nginx.conf) the real client IP
  // arrives via X-Forwarded-For. Trust exactly one proxy hop so req.ip
  // is the client address for rate limiting and audit fields.
  // Set TRUST_PROXY=false for direct-exposure deployments.
  if (process.env.TRUST_PROXY !== "false") {
    app.set("trust proxy", 1);
  }

  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());

  const allowedOrigins = getAllowedOrigins();
  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (curl, server-to-server, same-origin) send
        // no Origin header -> allow. Browser origins must be allowlisted.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(standardRateLimit);

  app.get("/", (_req, res) => {
    res.json({
      name: "MTA Market API",
      version: "0.1.0",
      status: "ok",
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  app.use("/auth", authRoutes);
  app.use("/resources", resourcesRoutes);
  app.use("/resources", versionsRoutes);
  app.use("/resources", reviewsRoutes);
  // TASK A-006: DRM v2 is the canonical machine protocol (/drm/v2/*).
  app.use("/drm", drmV2Routes);
  // TASK A-007: v1 activation endpoints are deprecated (410) inside;
  // v1 license management endpoints (my-licenses, revoke) remain.
  app.use("/drm", drmRoutes);
  app.use("/purchases", purchasesRoutes);
  app.use("/upload", uploadRoutes);
  app.use("/payments", paymentsRoutes);
  app.use("/admin", adminRoutes);

  // Explicit JSON 404 for unknown routes (TASK A-005 relies on this for
  // disabled test endpoints in production-like environments).
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}