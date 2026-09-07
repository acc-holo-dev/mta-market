/**
 * TASK-020: DRM Protocol v2 Service
 * 
 * High-level service for DRM v2 protocol operations.
 */

import { prisma } from '../prisma';
import type {
  InstallationRegistration,
  InstallationResponse,
  ChallengeVerification,
  VerificationResult,
  LeaseRequest,
  SignedLease,
  ServerKeyPair,
  HeartbeatRequest,
  HeartbeatResponse,
  Capability
} from './types';
import {
  generateChallenge,
  verifyChallengeResponse,
  signLease,
  generateNonce,
  isValidNonce,
  calculateLeaseExpiry
} from './crypto';
import { DRM_ERROR_CODES } from './types';

// Default lease duration: 7 days
const DEFAULT_LEASE_DURATION_SECONDS = 7 * 24 * 60 * 60;

/**
 * Generate server signing keypair
 * 
 * Should be called once during initial setup.
 * Private key MUST be stored securely (ENV/KMS/Vault).
 */
export async function createServerSigningKey(): Promise<ServerKeyPair> {
  const { generatePublisherKeypair } = await import('../artifact/crypto');
  
  // Check if active key already exists
  const existingKey = await prisma.serverSigningKey.findFirst({
    where: { status: 'ACTIVE' }
  });
  
  if (existingKey) {
    throw new Error('Active server signing key already exists');
  }
  
  // Generate keypair
  const { publicKey, privateKey } = generatePublisherKeypair();
  
  // Store public key in database
  const key = await prisma.serverSigningKey.create({
    data: {
      keyType: 'ED25519',
      publicKey,
      algorithm: 'EdDSA',
      status: 'ACTIVE'
    }
  });
  
  return {
    keyId: key.id,
    publicKey,
    privateKey // Caller must store securely
  };
}

/**
 * Register new installation
 * 
 * Client generates keypair and sends public key.
 * Server generates challenge for verification.
 */
export async function registerInstallation(
  input: InstallationRegistration
): Promise<InstallationResponse> {
  const { publicKey, mtaVersion, moduleVersion, serverSerial, serverName } = input;
  
  // Check if public key already registered
  const existing = await prisma.installation.findUnique({
    where: { publicKey }
  });
  
  if (existing) {
    throw new Error('Installation with this public key already exists');
  }
  
  // Generate challenge
  const challenge = generateChallenge();
  
  // Create installation record (pending verification)
  const installation = await prisma.installation.create({
    data: {
      licenseId: '', // Will be set during activation
      publicKey,
      challenge,
      serverSerial,
      serverName,
      mtaVersion,
      moduleVersion,
      status: 'PENDING_VERIFICATION'
    }
  });
  
  return {
    installationId: installation.id,
    challenge
  };
}

/**
 * Verify installation challenge response
 * 
 * Client signs challenge with private key.
 * Server verifies signature with public key.
 */
export async function verifyInstallation(
  input: ChallengeVerification
): Promise<VerificationResult> {
  const { installationId, challengeResponse } = input;
  
  // Get installation
  const installation = await prisma.installation.findUnique({
    where: { id: installationId }
  });
  
  if (!installation) {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_NOT_FOUND);
  }
  
  if (installation.status !== 'PENDING_VERIFICATION') {
    throw new Error('Installation already verified or revoked');
  }
  
  if (!installation.challenge) {
    throw new Error('No challenge found for installation');
  }
  
  // Verify signature
  const isValid = verifyChallengeResponse(
    installation.challenge,
    challengeResponse,
    installation.publicKey
  );
  
  if (!isValid) {
    throw new Error(DRM_ERROR_CODES.INVALID_CHALLENGE_RESPONSE);
  }
  
  // Mark as verified
  await prisma.installation.update({
    where: { id: installationId },
    data: {
      status: 'ACTIVE',
      verifiedAt: new Date().toISOString(),
      challenge: null // Clear challenge after verification
    }
  });
  
  return {
    verified: true,
    installationId
  };
}

/**
 * Activate license and generate signed lease
 * 
 * Verifies ownership and generates time-limited lease.
 */
export async function activateLicense(
  input: LeaseRequest,
  privateKey: string
): Promise<SignedLease> {
  const { licenseId, installationId, nonce } = input;
  
  // Validate nonce format
  if (!isValidNonce(nonce)) {
    throw new Error('Invalid nonce format');
  }
  
  // Check if nonce already used
  const existingLease = await prisma.lease.findUnique({
    where: { nonce }
  });
  
  if (existingLease) {
    throw new Error(DRM_ERROR_CODES.NONCE_ALREADY_USED);
  }
  
  // Get installation
  const installation = await prisma.installation.findUnique({
    where: { id: installationId }
  });
  
  if (!installation) {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_NOT_FOUND);
  }
  
  if (installation.status !== 'ACTIVE') {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_NOT_VERIFIED);
  }
  
  // Get license with resource info
  const license = await prisma.license.findUnique({
    where: { id: licenseId },
    include: {
      purchase: {
        include: {
          version: {
            include: {
              signature: true
            }
          }
        }
      }
    }
  });
  
  if (!license) {
    throw new Error(DRM_ERROR_CODES.INVALID_LICENSE);
  }
  
  if (license.status !== 'ACTIVE') {
    throw new Error(`License is ${license.status.toLowerCase()}`);
  }
  
  // Verify ownership (license belongs to same user as installation)
  // TODO: Add proper ownership check when user relation is available
  
  // Get artifact signature
  const signature = license.purchase.version.signature;
  if (!signature) {
    throw new Error('Resource version not signed');
  }
  
  // Get active server signing key
  const serverKey = await prisma.serverSigningKey.findFirst({
    where: { status: 'ACTIVE' }
  });
  
  if (!serverKey) {
    throw new Error('No active server signing key');
  }
  
  // Create lease payload
  const issuedAt = new Date().toISOString();
  const expiresAt = calculateLeaseExpiry(DEFAULT_LEASE_DURATION_SECONDS);
  
  const leasePayload = {
    protocolVersion: 2,
    licenseId,
    installationId,
    resourceId: license.purchase.resourceId,
    resourceVersionId: license.versionId,
    artifactHash: signature.artifactHash,
    issuedAt,
    expiresAt,
    nonce,
    capabilities: ['run', 'update'] as Capability[]
  };
  
  // Sign lease
  const leaseSignature = signLease(leasePayload, privateKey);
  
  // Store lease in database
  await prisma.lease.create({
    data: {
      installationId,
      licenseId,
      resourceId: leasePayload.resourceId,
      resourceVersionId: leasePayload.resourceVersionId,
      artifactHash: leasePayload.artifactHash,
      nonce,
      protocolVersion: 2,
      serverKeyId: serverKey.id,
      signature: leaseSignature,
      capabilities: leasePayload.capabilities,
      issuedAt,
      expiresAt
    }
  });
  
  // Update installation's licenseId
  await prisma.installation.update({
    where: { id: installationId },
    data: { licenseId }
  });
  
  // Return signed lease
  return {
    ...leasePayload,
    serverKeyId: serverKey.id,
    signature: leaseSignature
  };
}

/**
 * Record heartbeat from installation
 * 
 * Updates last seen timestamp and checks lease validity.
 */
export async function recordHeartbeat(
  input: HeartbeatRequest
): Promise<HeartbeatResponse> {
  const { installationId, resourceId, uptime, lastError } = input;
  
  // Update installation heartbeat
  await prisma.installation.update({
    where: { id: installationId },
    data: { lastHeartbeat: new Date().toISOString() }
  });
  
  // Check if lease is still valid
  const lease = await prisma.lease.findFirst({
    where: {
      installationId,
      resourceId
    },
    orderBy: { issuedAt: 'desc' }
  });
  
  const leaseValid = lease ? new Date(lease.expiresAt) > new Date() : false;
  
  // TODO: Check for updates
  const shouldUpdate = false;
  
  return {
    acknowledged: true,
    leaseValid,
    shouldUpdate,
    updateVersionId: undefined
  };
}

/**
 * Revoke installation
 * 
 * Prevents future lease generation for this installation.
 */
export async function revokeInstallation(
  installationId: string,
  revokedBy: string,
  reason: string
): Promise<void> {
  await prisma.installation.update({
    where: { id: installationId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date().toISOString(),
      revokedBy,
      revocationReason: reason
    }
  });
}

/**
 * Get active server public key
 * 
 * Used by clients to verify lease signatures.
 */
export async function getServerPublicKey(): Promise<string> {
  const key = await prisma.serverSigningKey.findFirst({
    where: { status: 'ACTIVE' }
  });
  
  if (!key) {
    throw new Error('No active server signing key');
  }
  
  return key.publicKey;
}

/**
 * Get lease by installation and resource
 */
export async function getActiveLease(
  installationId: string,
  resourceId: string
): Promise<SignedLease | null> {
  const lease = await prisma.lease.findFirst({
    where: {
      installationId,
      resourceId,
      expiresAt: {
        gt: new Date().toISOString()
      }
    },
    orderBy: { issuedAt: 'desc' }
  });
  
  if (!lease) {
    return null;
  }
  
  return {
    protocolVersion: lease.protocolVersion,
    licenseId: lease.licenseId,
    installationId: lease.installationId,
    resourceId: lease.resourceId,
    resourceVersionId: lease.resourceVersionId,
    artifactHash: lease.artifactHash,
    issuedAt: lease.issuedAt,
    expiresAt: lease.expiresAt,
    nonce: lease.nonce,
    serverKeyId: lease.serverKeyId,
    capabilities: lease.capabilities as Capability[],
    signature: lease.signature
  };
}
