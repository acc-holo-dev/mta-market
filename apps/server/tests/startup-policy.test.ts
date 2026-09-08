// TASK A-012: Secret startup policy tests.
// 1. Unit: production validation fails on missing critical secrets.
// 2. Acceptance: a process started in production with a missing secret
//    exits non-zero (real child process, not a mock).
import { describe, it, expect, afterEach, vi } from "vitest";
import { spawnSync } from "child_process";
import path from "path";

const savedEnv: Record<string, string | undefined> = {};

async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void> | void
): Promise<void> {
  for (const [k, v] of Object.entries(env)) {
    savedEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// validateEnvironment caches NODE_ENV at module load (PRODUCTION const),
// so the production mode requires a fresh module import.
async function validateAsProduction(): Promise<ReturnType<typeof import("../src/lib/startupValidation")["validateEnvironment"]>> {
  vi.resetModules();
  const { validateEnvironment } = await import("../src/lib/startupValidation");
  return validateEnvironment();
}

afterEach(() => {
  for (const k of Object.keys(savedEnv)) delete savedEnv[k];
  vi.resetModules();
});

describe("A-012: production secret validation (unit)", () => {
  it("fails when JWT_SECRET is missing in production", async () => {
    await withEnv({ NODE_ENV: "production", JWT_SECRET: undefined }, async () => {
      const result = await validateAsProduction();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("JWT_SECRET"))).toBe(true);
    });
  });

  it("fails when JWT_SECRET is too weak (<32 chars)", async () => {
    await withEnv({ NODE_ENV: "production", JWT_SECRET: "short" }, async () => {
      const result = await validateAsProduction();
      expect(result.errors.some((e) => e.includes("too weak"))).toBe(true);
    });
  });

  it("fails when DRM_SERVER_PRIVATE_KEY is missing (A-012: DRM signing keys)", async () => {
    await withEnv({ NODE_ENV: "production", DRM_SERVER_PRIVATE_KEY: undefined }, async () => {
      const result = await validateAsProduction();
      expect(result.errors.some((e) => e.includes("DRM_SERVER_PRIVATE_KEY"))).toBe(true);
    });
  });

  it("fails when ARTIFACT_SIGNING_PRIVATE_KEY is missing (B-002 signing key)", async () => {
    await withEnv({ NODE_ENV: "production", ARTIFACT_SIGNING_PRIVATE_KEY: undefined }, async () => {
      const result = await validateAsProduction();
      expect(result.errors.some((e) => e.includes("ARTIFACT_SIGNING_PRIVATE_KEY"))).toBe(true);
    });
  });

  it("fails when S3 is disabled in production (local storage not secure)", async () => {
    await withEnv({ NODE_ENV: "production", S3_ENABLED: "false" }, async () => {
      const result = await validateAsProduction();
      expect(result.errors.some((e) => e.includes("S3_ENABLED must be true"))).toBe(true);
    });
  });

  it("passes with a complete production secret set", async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        JWT_SECRET: "a".repeat(64),
        DATABASE_URL: "postgresql://test:test@localhost:5433/test",
        DISCORD_CLIENT_ID: "id",
        DISCORD_CLIENT_SECRET: "secret",
        DISCORD_REDIRECT_URI: "https://market.example.com/auth/callback",
        DRM_SERVER_PRIVATE_KEY: "k",
        ARTIFACT_SIGNING_PRIVATE_KEY: "k",
        S3_ENABLED: "true",
        S3_BUCKET: "bucket",
        S3_ACCESS_KEY: "ak",
        S3_SECRET_KEY: "sk",
      },
      async () => {
        const result = await validateAsProduction();
        expect(result.valid).toBe(true);
      }
    );
  });
});

describe("A-012: acceptance — missing secret exits non-zero", () => {
  it(
    "server process with a missing production secret exits non-zero",
    () => {
      const serverDir = path.resolve(__dirname, "..");
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: "production",
        PORT: "3999",
        DATABASE_URL: "postgresql://postgres@127.0.0.1:5433/postgres?schema=public",
        DISCORD_CLIENT_ID: "id",
        DISCORD_CLIENT_SECRET: "secret",
        DISCORD_REDIRECT_URI: "https://market.example.com/auth/callback",
        DRM_SERVER_PRIVATE_KEY: "k",
        ARTIFACT_SIGNING_PRIVATE_KEY: "k",
        S3_ENABLED: "true",
        S3_BUCKET: "bucket",
        S3_ACCESS_KEY: "ak",
        S3_SECRET_KEY: "sk",
        // JWT_SECRET intentionally missing
      };
      delete env.JWT_SECRET;

      const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/index.ts"], {
        cwd: serverDir,
        env,
        encoding: "utf-8",
        timeout: 60000,
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stderr}`).toContain("JWT_SECRET");
    },
    60000
  );
});