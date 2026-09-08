/**
 * TASK-020 / PLAN A-006: DRM Protocol v2 Service
 *
 * High-level service for DRM v2 protocol operations, rewritten against the
 * contract ORM (db.orm.public.*) — the previous version targeted a classic
 * Prisma Client API that does not exist in this project.
 *
 * Ownership model (PLAN INV-007):
 * - installation registration requires an authenticated user AND a license
 *   the user owns (license -> purchase.buyerId);
 * - the installation is permanently bound to that license at registration;
 * - lease activation can only happen for the bound license of a verified
 *   installation (challenge/response proves possession of the private key).
 */

import { db } from '../../prisma/db';
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
  calculateLeaseExpiry
} from './crypto';
import { DRM_ERROR_CODES } from './types';

// Default lease duration: 7 days
const DEFAULT_LEASE_DURATION_SECONDS = 7 * 24 * 60 * 60;

/**
 * Generate server signing keypair.
 *
 * Should be called once during initial setup (CLI: pnpm drm:keygen).
 * Private key MUST be stored securely (ENV/KMS/Vault) — it is returned
 * exactly once and never persisted by this service.
 */
export async function createServerSigningKey(): Promise<ServerKeyPair> {
  const { generatePublisherKeypair } = await import('../artifact/crypto');

  // Check if active key already exists
  const existingKey = await db.orm.public.ServerSigningKey.where({
    status: 'ACTIVE'
  }).first();

  if (existingKey) {
    throw new Error('Active server signing key already exists');
  }

  // Generate keypair
  const { publicKey, privateKey } = generatePublisherKeypair();

  // Store public key in database
  const key = await db.orm.public.ServerSigningKey.create({
    keyType: 'ED25519',
    publicKey,
    algorithm: 'EdDSA',
    status: 'ACTIVE'
  });

  return {
    keyId: key.id,
    publicKey,
    privateKey // Caller must store securely
  };
}

/**
 * Register new installation for a license the authenticated user owns.
 *
 * Client generates keypair and sends public key. Server verifies license
 * ownership, binds the installation to the license and issues a challenge
 * for possession-of-private-key verification.
 */
export async function registerInstallation(
  input: InstallationRegistration,
  ownerId: string
): Promise<InstallationResponse> {
  const { publicKey, licenseId, mtaVersion, moduleVersion, serverSerial, serverName } = input;

  // License must exist and be active
  const license = await db.orm.public.License.where({ id: licenseId }).first();

  if (!license) {
    throw new Error(DRM_ERROR_CODES.INVALID_LICENSE);
  }

  if (license.status !== 'ACTIVE') {
    throw new Error(`License is ${license.status.toLowerCase()}`);
  }

  // INV-007: the authenticated user must own the license
  // (license -> purchase -> buyerId)
  const purchase = await db.orm.public.Purchase.where({ id: license.purchaseId }).first();

  if (!purchase) {
    throw new Error(DRM_ERROR_CODES.INVALID_LICENSE);
  }

  if (purchase.buyerId !== ownerId) {
    throw new Error(DRM_ERROR_CODES.LICENSE_NOT_OWNED);
  }

  // Public key must not already be registered
  const existing = await db.orm.public.Installation.where({ publicKey }).first();

  if (existing) {
    throw new Error('Installation with this public key already exists');
  }

  // Generate challenge
  const challenge = generateChallenge();

  // Create installation record (pending verification), bound to the license
  const installation = await db.orm.public.Installation.create({
    licenseId,
    publicKey,
    challenge,
    serverSerial: serverSerial || null,
    serverName: serverName || null,
    mtaVersion,
    moduleVersion,
    status: 'PENDING_VERIFICATION'
  });

  return {
    installationId: installation.id,
    challenge
  };
}

/**
 * Verify installation challenge response.
 *
 * Client signs the challenge with its private key. Server verifies the
 * signature with the registered public key. This proves possession of the
 * installation private key without it ever leaving the installation.
 */
export async function verifyInstallation(
  input: ChallengeVerification
): Promise<VerificationResult> {
  const { installationId, challengeResponse } = input;

  const installation = await db.orm.public.Installation.where({ id: installationId }).first();

  if (!installation) {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_NOT_FOUND);
  }

  if (installation.status === 'REVOKED') {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_REVOKED);
  }

  if (installation.status !== 'PENDING_VERIFICATION') {
    throw new Error('Installation already verified');
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
  await db.orm.public.Installation.where({ id: installationId }).update({
    status: 'ACTIVE',
    verifiedAt: new Date().toISOString(),
    challenge: null // Clear challenge after verification
  });

  return {
    verified: true,
    installationId
  };
}

/**
 * Activate license and generate signed lease.
 *
 * The installation must be verified (challenge passed) and the requested
 * license must be the one the installation is bound to. Ownership was
 * proven at registration time; possession of the installation key was
 * proven at verification time.
 */
export async function activateLicense(
  input: LeaseRequest,
  privateKey: string
): Promise<SignedLease> {
  const { licenseId, installationId, nonce } = input;

  // Validate nonce format
  if (!/^[a-f0-9]{64}$/i.test(nonce)) {
    throw new Error('Invalid nonce format');
  }

  // Check if nonce already used (replay protection)
  const existingLease = await db.orm.public.Lease.where({ nonce }).first();

  if (existingLease) {
    throw new Error(DRM_ERROR_CODES.NONCE_ALREADY_USED);
  }

  // Get installation
  const installation = await db.orm.public.Installation.where({ id: installationId }).first();

  if (!installation) {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_NOT_FOUND);
  }

  if (installation.status === 'REVOKED') {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_REVOKED);
  }

  if (installation.status !== 'ACTIVE') {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_NOT_VERIFIED);
  }

  // INV-007/INV-011: a lease can only be issued for the license the
  // installation is bound to — never for an arbitrary license id.
  if (installation.licenseId !== licenseId) {
    throw new Error(DRM_ERROR_CODES.LICENSE_INSTALLATION_MISMATCH);
  }

  // Get license
  const license = await db.orm.public.License.where({ id: licenseId }).first();

  if (!license) {
    throw new Error(DRM_ERROR_CODES.INVALID_LICENSE);
  }

  if (license.status !== 'ACTIVE') {
    throw new Error(`License is ${license.status.toLowerCase()}`);
  }

  // Resolve the purchase for resource binding
  const purchase = await db.orm.public.Purchase.where({ id: license.purchaseId }).first();

  if (!purchase) {
    throw new Error(DRM_ERROR_CODES.INVALID_LICENSE);
  }

  // Get artifact signature for the licensed version
  const signature = await db.orm.public.ArtifactSignature.where({
    versionId: license.versionId
  }).first();

  if (!signature) {
    throw new Error('Resource version not signed');
  }

  // Get active server signing key
  const serverKey = await db.orm.public.ServerSigningKey.where({ status: 'ACTIVE' }).first();

  if (!serverKey) {
    throw new Error('No active server signing key');
  }

  // Create lease payload (serverKeyId is bound into the signature)
  const issuedAt = new Date().toISOString();
  const expiresAt = calculateLeaseExpiry(DEFAULT_LEASE_DURATION_SECONDS);

  const leasePayload = {
    protocolVersion: 2 as const,
    licenseId,
    installationId,
    resourceId: purchase.resourceId,
    resourceVersionId: license.versionId,
    artifactHash: signature.artifactHash,
    issuedAt,
    expiresAt,
    nonce,
    serverKeyId: serverKey.id,
    capabilities: ['run', 'update'] as Capability[]
  };

  // Sign lease
  const leaseSignature = signLease(leasePayload, privateKey);

  // Store lease in database
  await db.orm.public.Lease.create({
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
  });

  // Return signed lease
  return {
    ...leasePayload,
    signature: leaseSignature
  };
}

/**
 * Record heartbeat from installation.
 *
 * Updates last seen timestamp and reports lease validity. Revoked
 * installations are rejected outright.
 */
export async function recordHeartbeat(
  input: HeartbeatRequest
): Promise<HeartbeatResponse> {
  const { installationId, resourceId } = input;

  const installation = await db.orm.public.Installation.where({ id: installationId }).first();

  if (!installation) {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_NOT_FOUND);
  }

  if (installation.status === 'REVOKED') {
    throw new Error(DRM_ERROR_CODES.INSTALLATION_REVOKED);
  }

  // Update installation heartbeat
  await db.orm.public.Installation.where({ id: installationId }).update({
    lastHeartbeat: new Date().toISOString()
  });

  // Latest lease for this installation + resource
  const leases = await db.orm.public.Lease
    .where({ installationId, resourceId })
    .orderBy((m) => m.issuedAt.desc())
    .limit(1)
    .all();
  const lease = leases[0];

  const leaseValid = lease ? new Date(lease.expiresAt) > new Date() : false;

  // TODO (Phase I): check for newer published versions
  const shouldUpdate = false;

  return {
    acknowledged: true,
    leaseValid,
    shouldUpdate,
    updateVersionId: undefined
  };
}

/**
 * Revoke installation.
 *
 * Prevents future lease generation for this installation. Already issued
 * leases keep their natural expiry (documented policy, see ADR-001).
 */
export async function revokeInstallation(
  installationId: string,
  revokedBy: string,
  reason: string
): Promise<void> {
  await db.orm.public.Installation.where({ id: installationId }).update({
    status: 'REVOKED',
    revokedAt: new Date().toISOString(),
    revokedBy,
    revocationReason: reason
  });
}

/**
 * Get active server public key.
 *
 * Used by clients to verify lease signatures.
 */
export async function getServerPublicKey(): Promise<string> {
  const key = await db.orm.public.ServerSigningKey.where({ status: 'ACTIVE' }).first();

  if (!key) {
    throw new Error('No active server signing key');
  }

  return key.publicKey;
}

/**
 * Get active (unexpired) lease for installation and resource.
 */
export async function getActiveLease(
  installationId: string,
  resourceId: string
): Promise<SignedLease | null> {
  const leases = await db.orm.public.Lease
    .where({ installationId, resourceId })
    .orderBy((m) => m.issuedAt.desc())
    .limit(1)
    .all();
  const lease = leases[0];

  if (!lease || new Date(lease.expiresAt) <= new Date()) {
    return null;
  }

  return {
    protocolVersion: 2,
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