import express from "express";
import dotenv from "dotenv";
import { enforceEnvironmentValidation } from "./lib/startupValidation";
import { createApp } from "./app";

dotenv.config();

// SECURITY: Validate environment before starting server
enforceEnvironmentValidation();

const app = createApp();
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Resources API: /resources`);
  console.log(`📦 Versions API: /resources/:slug/versions`);
  console.log(`⭐ Reviews API: /resources/:slug/reviews`);
  console.log(`🔐 DRM API: /drm (v2 protocol)`);
  console.log(`💰 Purchases API: /purchases`);
  console.log(`📤 Upload API: /upload`);
  console.log(`💳 Payments API: /payments`);
  console.log(`👑 Admin API: /admin`);
});