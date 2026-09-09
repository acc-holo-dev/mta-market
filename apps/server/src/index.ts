import dotenv from "dotenv";
import { enforceEnvironmentValidation } from "./lib/startupValidation";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { startReconciliationScheduler } from "./jobs/reconciliation";

dotenv.config();

// SECURITY: Validate environment before starting server
enforceEnvironmentValidation();

const app = createApp();
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  logger.info("server_started", {
    port: PORT,
    node_env: process.env.NODE_ENV ?? "development",
  });

  // PLAN B-003: periodic financial reconciliation (payments/refunds/payouts/
  // provider events/internal ledger). No-op in test env; stop() handle kept
  // for graceful shutdown.
  const stopReconciliation = startReconciliationScheduler();

  const shutdown = (signal: string): void => {
    logger.info("server_shutdown", { signal });
    stopReconciliation.stop();
    server.close(() => process.exit(0));
    // Fallback exit if connections keep the process alive.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
