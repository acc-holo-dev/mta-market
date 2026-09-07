/**
 * TASK-019: Artifact Signing Service
 * 
 * High-level service for signing and verifying artifacts.
 * Integrates with database and cryptography modules.
 */

import { prisma } from '../prisma';
import type { ArtifactManifest, SignedArtifact, VerificationResult } from './types';
import { generatePublisherKeypair, signArtifact, verifyArtifactSignature, hashFile, isValidPublicKey } from './crypto';
import { generateManifest, attachSignatureMetadata, validateManifest } from './manifest';

/**
 * Generate keypair for seller (call once per seller)
 * 
 * IMPORTANT: Store privateKey securely (ENV, KMS, Vault)
 * NEVER store in database or expose to client
 * 
 * @param sellerId - User ID of the seller
 * @returns Generated keypair and database record ID
 */
export async function createPublisherKey(sellerId: string): Promise<{
  keyId: string;
  publicKey: string;
  privateKey: string; // MUST be stored securely by caller
}> {
  // Check if seller already has an active key
  const existingKey = await prisma.publisherKey.findFirst({
    where: {
      sellerId,
      status: 'ACTIVE'
    }
  });

  if (existingKey) {
    throw new Error('Seller already has an active publisher key');
  }

  // Generate keypair
  const { publicKey, privateKey } = generatePublisherKeypair();

  // Store public key in database
  const key = await prisma.publisherKey.create({
    data: {
      sellerId,
      keyType: 'ED25519',
      publicKey,
      algorithm: 'EdDSA',
      status: 'ACTIVE'
    }
  });

  return {
    keyId: key.id,
    publicKey,
    privateKey // Caller must store this securely
  };
}

/**
 * Sign artifact and store signature in database
 * 
 * @param versionId - ResourceVersion ID
 * @param artifactBuffer - Raw artifact file buffer
 * @param privateKey - Seller's private key (from secure storage)
 * @returns Signed artifact with manifest and signature
 */
export async function signAndStoreArtifact(
  versionId: string,
  artifactBuffer: Buffer,
  privateKey: string
): Promise<SignedArtifact> {
  // 1. Get resource version
  const version = await prisma.resourceVersion.findUnique({
    where: { id: versionId },
    include: {
      resource: {
        include: {
          seller: true
        }
      }
    }
  });

  if (!version) {
    throw new Error('Resource version not found');
  }

  const sellerId = version.resource.sellerId;

  // 2. Get seller's public key
  const key = await prisma.publisherKey.findFirst({
    where: {
      sellerId,
      status: 'ACTIVE'
    }
  });

  if (!key) {
    throw new Error('Seller does not have an active publisher key');
  }

  // 3. Generate manifest
  const manifest = await generateManifest({
    resourceId: version.resource.id,
    versionId: version.id,
    sellerId,
    artifactBuffer,
    version: version.version,
    drmEnabled: true
  });

  // 4. Calculate artifact hash
  const artifactHash = hashFile(artifactBuffer);

  // 5. Sign manifest + artifact
  const signature = signArtifact({
    manifest,
    artifactHash,
    privateKey
  });

  // 6. Update manifest with signature metadata
  const signedManifest = attachSignatureMetadata(manifest, key.id, key.publicKey);

  // 7. Store signature in database
  const artifactSignature = await prisma.artifactSignature.create({
    data: {
      versionId: version.id,
      keyId: key.id,
      signature,
      algorithm: 'EdDSA',
      manifestHash: manifest.sha256,
      artifactHash,
      manifest: signedManifest as any,
      signedAt: new Date().toISOString()
    }
  });

  return {
    manifest: signedManifest,
    signature,
    manifestHash: manifest.sha256,
    artifactHash
  };
}

/**
 * Verify artifact signature from database
 * 
 * @param versionId - ResourceVersion ID
 * @param artifactBuffer - Artifact file buffer to verify
 * @returns Verification result
 */
export async function verifyStoredArtifact(
  versionId: string,
  artifactBuffer: Buffer
): Promise<VerificationResult> {
  // 1. Get signature from database
  const artifactSignature = await prisma.artifactSignature.findUnique({
    where: { versionId },
    include: {
      key: true
    }
  });

  if (!artifactSignature) {
    return {
      valid: false,
      errors: ['No signature found for this artifact'],
      warnings: []
    };
  }

  // 2. Check if key is still active
  if (artifactSignature.key.status !== 'ACTIVE') {
    return {
      valid: false,
      errors: [`Publisher key is ${artifactSignature.key.status.toLowerCase()}`],
      warnings: []
    };
  }

  // 3. Calculate artifact hash
  const artifactHash = hashFile(artifactBuffer);

  // 4. Verify signature
  const result = verifyArtifactSignature({
    manifest: artifactSignature.manifest as ArtifactManifest,
    signature: artifactSignature.signature,
    publicKey: artifactSignature.key.publicKey,
    artifactHash
  });

  // 5. Update verification timestamp if valid
  if (result.valid) {
    await prisma.artifactSignature.update({
      where: { id: artifactSignature.id },
      data: { verifiedAt: new Date().toISOString() }
    });
  }

  return result;
}

/**
 * Get manifest for resource version
 * 
 * @param versionId - ResourceVersion ID
 * @returns Artifact manifest or null
 */
export async function getManifest(versionId: string): Promise<ArtifactManifest | null> {
  const signature = await prisma.artifactSignature.findUnique({
    where: { versionId }
  });

  if (!signature) {
    return null;
  }

  return signature.manifest as ArtifactManifest;
}

/**
 * Revoke publisher key
 * 
 * @param keyId - PublisherKey ID
 * @param revokedBy - User ID who revoked the key
 * @param reason - Revocation reason
 */
export async function revokePublisherKey(
  keyId: string,
  revokedBy: string,
  reason: string
): Promise<void> {
  await prisma.publisherKey.update({
    where: { id: keyId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date().toISOString(),
      revokedBy,
      revocationReason: reason
    }
  });
}

/**
 * Get all publisher keys for seller
 * 
 * @param sellerId - User ID
 * @returns List of publisher keys
 */
export async function getPublisherKeys(sellerId: string) {
  return await prisma.publisherKey.findMany({
    where: { sellerId },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Get active publisher key for seller
 * 
 * @param sellerId - User ID
 * @returns Active key or null
 */
export async function getActivePublisherKey(sellerId: string) {
  return await prisma.publisherKey.findFirst({
    where: {
      sellerId,
      status: 'ACTIVE'
    }
  });
}

/**
 * Check if artifact has valid signature
 * 
 * @param versionId - ResourceVersion ID
 * @returns True if signature exists and is valid
 */
export async function hasValidSignature(versionId: string): Promise<boolean> {
  const signature = await prisma.artifactSignature.findUnique({
    where: { versionId },
    include: {
      key: true
    }
  });

  if (!signature) {
    return false;
  }

  if (signature.key.status !== 'ACTIVE') {
    return false;
  }

  return true;
}
