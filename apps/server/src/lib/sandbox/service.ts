/**
 * TASK-022 / PLAN B-001: Upload Sandbox Service
 *
 * Main service for artifact validation and sandbox execution.
 * Rewritten against the contract ORM (db.orm.public.*) — the original
 * targeted a classic Prisma Client API that does not exist in this project.
 */

import { db } from '../../prisma/db';
import { validateArchive } from './static';
import { runSandbox, isDockerAvailable } from './runner';
import type {
  StaticValidationResult,
  SandboxRunResult,
  SandboxConfig
} from './types';
import { DEFAULT_SANDBOX_CONFIG } from './types';

/**
 * Validate and execute artifact in sandbox
 *
 * Two-phase validation:
 * 1. Static validation (fast, no execution)
 * 2. Sandbox execution (slow, isolated; requires Docker)
 *
 * @param versionId - ResourceVersion ID
 * @param artifactBuffer - Artifact file buffer
 * @param config - Sandbox configuration
 * @returns Combined validation result
 */
export async function validateArtifact(
  versionId: string,
  artifactBuffer: Buffer,
  config: SandboxConfig = DEFAULT_SANDBOX_CONFIG
): Promise<{
  staticValidation: StaticValidationResult;
  sandboxRun?: SandboxRunResult;
  passed: boolean;
}> {
  // Phase 1: Static validation
  console.log(`[Sandbox] Starting static validation for version ${versionId}`);
  const staticValidation = await validateArchive(artifactBuffer, config);

  if (!staticValidation.valid) {
    console.log(`[Sandbox] Static validation failed:`, staticValidation.errors);

    // Store failed validation
    await db.orm.public.SandboxRun.create({
      versionId,
      status: 'FAILED',
      staticValidation: staticValidation as any,
      completedAt: new Date().toISOString(),
      timeoutSeconds: config.timeoutSeconds,
      cpuLimit: config.cpuLimit,
      memoryLimitMb: config.memoryLimitMb,
      stderr: staticValidation.errors.join('\n')
    });

    return {
      staticValidation,
      passed: false
    };
  }

  console.log(`[Sandbox] Static validation passed`);

  // Phase 2: Sandbox execution (if Docker available)
  const dockerAvailable = await isDockerAvailable();

  if (!dockerAvailable) {
    console.warn('[Sandbox] Docker not available, skipping sandbox execution');

    // Store pending sandbox run
    await db.orm.public.SandboxRun.create({
      versionId,
      status: 'PENDING',
      staticValidation: staticValidation as any,
      timeoutSeconds: config.timeoutSeconds,
      cpuLimit: config.cpuLimit,
      memoryLimitMb: config.memoryLimitMb,
      stdout: 'Docker not available - manual review required'
    });

    return {
      staticValidation,
      passed: true // Pass static validation, manual review for sandbox
    };
  }

  // Create sandbox run record
  const sandboxRecord = await db.orm.public.SandboxRun.create({
    versionId,
    status: 'RUNNING',
    staticValidation: staticValidation as any,
    timeoutSeconds: config.timeoutSeconds,
    cpuLimit: config.cpuLimit,
    memoryLimitMb: config.memoryLimitMb
  });

  console.log(`[Sandbox] Starting sandbox execution for version ${versionId}`);

  try {
    // Execute in sandbox
    const sandboxRun = await runSandbox({
      artifact: artifactBuffer,
      timeoutSeconds: config.timeoutSeconds,
      cpuLimit: config.cpuLimit,
      memoryLimitMb: config.memoryLimitMb,
      networkAllowed: false
    });

    console.log(`[Sandbox] Execution completed with status: ${sandboxRun.status}`);

    // Update sandbox run record
    await db.orm.public.SandboxRun.where({ id: sandboxRecord.id }).update({
      status: sandboxRun.status === 'success' ? 'SUCCESS' :
              sandboxRun.status === 'timeout' ? 'TIMEOUT' :
              sandboxRun.status === 'security_violation' ? 'SECURITY_VIOLATION' : 'FAILED',
      completedAt: new Date().toISOString(),
      exitCode: sandboxRun.exitCode,
      stdout: sandboxRun.stdout,
      stderr: sandboxRun.stderr,
      compatibilityReport: sandboxRun.compatibilityReport as any,
      securityReport: { issues: sandboxRun.securityIssues } as any
    });

    const passed = sandboxRun.status === 'success' && sandboxRun.securityIssues.length === 0;

    return {
      staticValidation,
      sandboxRun,
      passed
    };

  } catch (error) {
    console.error('[Sandbox] Execution error:', error);

    // Update sandbox run as failed
    await db.orm.public.SandboxRun.where({ id: sandboxRecord.id }).update({
      status: 'FAILED',
      completedAt: new Date().toISOString(),
      stderr: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      staticValidation,
      sandboxRun: {
        status: 'failed',
        exitCode: -1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        duration: 0,
        securityIssues: []
      },
      passed: false
    };
  }
}

/**
 * Get the latest sandbox run for a version.
 * Return type annotated loosely: the ORM row type is not nameable across
 * pnpm store paths (TS2742) when emitting declarations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSandboxRun(versionId: string): Promise<any | null> {
  const runs = await db.orm.public.SandboxRun
    .where({ versionId })
    .orderBy((m) => m.startedAt.desc())
    .limit(1)
    .all();
  return runs[0] ?? null;
}

/**
 * Get all sandbox runs for a resource (through its versions).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSandboxRuns(resourceId: string): Promise<any[]> {
  const versions = await db.orm.public.ResourceVersion.where({ resourceId }).all();
  const versionIds = new Set(versions.map((v) => v.id));

  const allRuns = await db.orm.public.SandboxRun.where({}).all();
  return allRuns
    .filter((r) => versionIds.has(r.versionId))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/**
 * Retry sandbox execution
 */
export async function retrySandbox(versionId: string): Promise<void> {
  const versions = await db.orm.public.ResourceVersion.where({ id: versionId }).all();
  const version = versions[0];

  if (!version) {
    throw new Error('Version not found');
  }

  // Re-download artifact and validate
  // In production: fetch from S3
  console.log(`[Sandbox] Retry requested for version ${versionId}`);
  throw new Error('Retry not yet implemented - artifact must be re-uploaded');
}

/**
 * Clean up old sandbox runs.
 * The contract ORM delete() removes a single row per call, so matching rows
 * are drained in a loop.
 */
export async function cleanupOldSandboxRuns(daysOld: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const allRuns = await db.orm.public.SandboxRun.where({}).all();
  const stale = allRuns.filter(
    (r) =>
      new Date(r.startedAt) < cutoffDate &&
      ['SUCCESS', 'FAILED', 'TIMEOUT'].includes(r.status)
  );

  for (const run of stale) {
    await db.orm.public.SandboxRun.where({ id: run.id }).delete();
  }

  console.log(`[Sandbox] Cleaned up ${stale.length} old sandbox runs`);
  return stale.length;
}