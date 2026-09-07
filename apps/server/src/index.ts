import express from "express";
import dotenv from "dotenv";
import path from "path";
import { enforceEnvironmentValidation } from "./lib/startupValidation";
import authRoutes from "./routes/auth";
import resourcesRoutes from "./routes/resources";
import versionsRoutes from "./routes/versions";
import reviewsRoutes from "./routes/reviews";
import drmRoutes from "./routes/drm";
import purchasesRoutes from "./routes/purchases";
import uploadRoutes from "./routes/upload";
import paymentsRoutes from "./routes/payments";
import adminRoutes from "./routes/admin";
import { standardRateLimit } from "./lib/rateLimit";

dotenv.config();

// SECURITY: Validate environment before starting server
enforceEnvironmentValidation();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(standardRateLimit);

// Static file serving for uploads (local storage)
const uploadDir = process.env.UPLOAD_DIR || "./uploads";
app.use("/uploads", express.static(path.resolve(uploadDir)));

app.get("/", (_req, res) => {
  res.json({
    name: "MTA Market API",
    version: "0.1.0",
    stage: "Stage 5: Complete Backend",
    status: "ok",
    features: {
      prisma: "configured",
      auth: "jwt + oauth2 discord (full)",
      rateLimit: "redis",
      resources: "full CRUD",
      versions: "upload & download",
      reviews: "full CRUD",
      drm: "license & installation management",
      purchases: "buying & ownership tracking",
      upload: "file upload (local + S3)",
      payments: "YooKassa integration",
      email: "notifications",
      admin: "moderation panel",
    },
    endpoints: {
      auth: "/auth/*",
      resources: "/resources/*",
      versions: "/resources/:slug/versions/*",
      reviews: "/resources/:slug/reviews/*",
      drm: "/drm/*",
      purchases: "/purchases/*",
      upload: "/upload/*",
      payments: "/payments/*",
      admin: "/admin/*",
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.use("/auth", authRoutes);
app.use("/resources", resourcesRoutes);
app.use("/resources", versionsRoutes);
app.use("/resources", reviewsRoutes);
app.use("/drm", drmRoutes);
app.use("/purchases", purchasesRoutes);
app.use("/upload", uploadRoutes);
app.use("/payments", paymentsRoutes);
app.use("/admin", adminRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Stage 5: Complete Backend initialized`);
  console.log(`📝 Resources API: /resources`);
  console.log(`📦 Versions API: /resources/:slug/versions`);
  console.log(`⭐ Reviews API: /resources/:slug/reviews`);
  console.log(`🔐 DRM API: /drm`);
  console.log(`💰 Purchases API: /purchases`);
  console.log(`📤 Upload API: /upload`);
  console.log(`💳 Payments API: /payments`);
  console.log(`👑 Admin API: /admin`);
});
