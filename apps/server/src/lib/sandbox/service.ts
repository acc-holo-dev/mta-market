/**
 * TASK-022: Upload Sandbox Service
 * 
 * Main service for artifact validation and sandbox execution.
 */

import { prisma } from '../prisma';
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
 * 2. Sandbox execution (slow, isolated)
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
    await prisma.sandboxRun.create({
      data: {
        versionId,
        status: 'FAILED',
        staticValidation: staticValidation as any,
        completedAt: new Date().toISOString(),
        timeoutSeconds: config.timeoutSeconds,
        cpuLimit: config.cpuLimit,
        memoryLimitMb: config.memoryLimitMb,
        stderr: staticValidation.errors.join('\n')
      }
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
    await prisma.sandboxRun.create({
      data: {
        versionId,
        status: 'PENDING',
        staticValidation: staticValidation as any,
        timeoutSeconds: config.timeoutSeconds,
        cpuLimit: config.cpuLimit,
        memoryLimitMb: config.memoryLimitMb,
        stdout: 'Docker not available - manual review required'
      }
    });
    
    return {
      staticValidation,
      passed: true // Pass static validation, manual review for sandbox
    };
  }
  
  // Create sandbox run record
  const sandboxRecord = await prisma.sandboxRun.create({
    data: {
      versionId,
      status: 'RUNNING',
      staticValidation: staticValidation as any,
      timeoutSeconds: config.timeoutSeconds,
      cpuLimit: config.cpuLimit,
      memoryLimitMb: config.memoryLimitMb
    }
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
    await prisma.sandboxRun.update({
      where: { id: sandboxRecord.id },
      data: {
        status: sandboxRun.status === 'success' ? 'SUCCESS' : 
                sandboxRun.status === 'timeout' ? 'TIMEOUT' :
                sandboxRun.status === 'security_violation' ? 'SECURITY_VIOLATION' : 'FAILED',
        completedAt: new Date().toISOString(),
        exitCode: sandboxRun.exitCode,
        stdout: sandboxRun.stdout,
        stderr: sandboxRun.stderr,
        compatibilityReport: sandboxRun.compatibilityReport as any,
        securityReport: { issues: sandboxRun.securityIssues } as any
      }
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
    await prisma.sandboxRun.update({
      where: { id: sandboxRecord.id },
      data: {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        stderr: error instanceof Error ? error.message : 'Unknown error'
      }
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
 * Get sandbox run result
 */
export async function getSandboxRun(versionId: string) {
  return await prisma.sandboxRun.findFirst({
    where: { versionId },
    orderBy: { startedAt: 'desc' }
  });
}

/**
 * Get all sandbox runs for resource
 */
export async function getSandboxRuns(resourceId: string) {
  return await prisma.sandboxRun.findMany({
    where: {
      version: {
        resourceId
      }
    },
    orderBy: { startedAt: 'desc' },
    include: {
      version: {
        select: {
          version: true
        }
      }
    }
  });
}

/**
 * Retry sandbox execution
 */
export async function retrySandbox(versionId: string): Promise<void> {
  const version = await prisma.resourceVersion.findUnique({
    where: { id: versionId }
  });
  
  if (!version) {
    throw new Error('Version not found');
  }
  
  // Re-download artifact and validate
  // In production: fetch from S3
  console.log(`[Sandbox] Retry requested for version ${versionId}`);
  throw new Error('Retry not yet implemented - artifact must be re-uploaded');
}

/**
 * Clean up old sandbox runs
 */
export async function cleanupOldSandboxRuns(daysOld: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await prisma.sandboxRun.deleteMany({
    where: {
      startedAt: {
        lt: cutoffDate.toISOString()
      },
      status: {
        in: ['SUCCESS', 'FAILED', 'TIMEOUT']
      }
    }
  });
  
  console.log(`[Sandbox] Cleaned up ${result.count} old sandbox runs`);
  return result.count;
}
