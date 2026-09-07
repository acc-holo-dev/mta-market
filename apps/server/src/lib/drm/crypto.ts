/**
 * TASK-020: DRM Protocol v2 - Cryptography
 * 
 * Cryptographic operations for DRM v2 protocol.
 * Reuses Ed25519 functions from artifact signing module.
 */

import { randomBytes, createHash } from 'crypto';
import { 
  generatePublisherKeypair, 
  signArtifact, 
  verifyArtifactSignature,
  canonicalJSON 
} from '../artifact/crypto';
import type { 
  InstallationKeypair, 
  SignedLease, 
  LeasePayload,
  LeaseVerificationResult 
} from './types';

/**
 * Generate Ed25519 keypair for installation (client-side)
 * 
 * Same as publisher keypair, but used for installation identity.
 */
export function generateInstallationKeypair(): InstallationKeypair {
  return generatePublisherKeypair();
}

/**
 * Generate random challenge for installation verification
 * 
 * @returns Base64 encoded random challenge (32 bytes)
 */
export function generateChallenge(): string {
  return randomBytes(32).toString('base64');
}

/**
 * Sign challenge with installation private key
 * 
 * This is done client-side in the MTA module.
 * 
 * @param challenge - Base64 encoded challenge
 * @param privateKey - Installation's private key
 * @returns Base64 encoded signature
 */
export function signChallenge(challenge: string, privateKey: string): string {
  const challengeBuffer = Buffer.from(challenge, 'base64');
  
  // Reuse artifact signing (same Ed25519 signature)
  const mockManifest = { challenge: challenge };
  const mockHash = createHash('sha256').update(challengeBuffer).digest('hex');
  
  return signArtifact({
    manifest: mockManifest as any,
    artifactHash: mockHash,
    privateKey
  });
}

/**
 * Verify challenge response signature
 * 
 * @param challenge - Original challenge sent to client
 * @param challengeResponse - Client's signature
 * @param publicKey - Installation's public key
 * @returns True if signature is valid
 */
export function verifyChallengeResponse(
  challenge: string,
  challengeResponse: string,
  publicKey: string
): boolean {
  const challengeBuffer = Buffer.from(challenge, 'base64');
  const mockManifest = { 
    challenge: challenge,
    sha256: createHash('sha256').update(challengeBuffer).digest('hex')
  };
  const mockHash = createHash('sha256').update(challengeBuffer).digest('hex');
  
  const result = verifyArtifactSignature({
    manifest: mockManifest as any,
    signature: challengeResponse,
    publicKey,
    artifactHash: mockHash
  });
  
  return result.valid;
}

/**
 * Sign DRM lease with server's private key
 * 
 * @param lease - Lease payload
 * @param privateKey - Server's signing private key
 * @returns Base64 encoded signature
 */
export function signLease(lease: LeasePayload, privateKey: string): string {
  // Create canonical payload
  const payload = createLeaseSigningPayload(lease);
  
  // Reuse artifact signing
  return signArtifact({
    manifest: { ...lease } as any,
    artifactHash: payload,
    privateKey
  });
}

/**
 * Verify lease signature with server's public key
 * 
 * @param lease - Signed lease
 * @param serverPublicKey - Server's public key
 * @returns Verification result
 */
export function verifyLeaseSignature(
  lease: SignedLease,
  serverPublicKey: string
): LeaseVerificationResult {
  try {
    // Extract payload
    const { signature, ...payload } = lease;
    
    // Create canonical signing payload
    const signingPayload = createLeaseSigningPayload(payload);
    
    // Verify signature
    const result = verifyArtifactSignature({
      manifest: { ...payload, sha256: signingPayload } as any,
      signature,
      publicKey: serverPublicKey,
      artifactHash: signingPayload
    });
    
    if (!result.valid) {
      return {
        valid: false,
        errors: ['Invalid lease signature'],
        warnings: []
      };
    }
    
    // Check expiry
    const now = Date.now();
    const expiresAt = new Date(lease.expiresAt).getTime();
    
    if (now > expiresAt) {
      return {
        valid: false,
        errors: ['Lease expired'],
        warnings: []
      };
    }
    
    // Check protocol version
    if (lease.protocolVersion !== 2) {
      return {
        valid: false,
        errors: [`Unsupported protocol version: ${lease.protocolVersion}`],
        warnings: []
      };
    }
    
    return {
      valid: true,
      errors: [],
      warnings: [],
      lease: {
        protocolVersion: lease.protocolVersion,
        licenseId: lease.licenseId,
        expiresAt: lease.expiresAt,
        capabilities: lease.capabilities
      }
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: []
    };
  }
}

/**
 * Create canonical signing payload for lease
 * 
 * Format: hash(canonicalJSON(lease))
 */
function createLeaseSigningPayload(lease: any): string {
  const canonical = canonicalJSON(lease);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Generate random nonce for replay protection
 * 
 * @returns Random hex string (32 bytes)
 */
export function generateNonce(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate nonce format
 * 
 * @param nonce - Nonce to validate
 * @returns True if valid format
 */
export function isValidNonce(nonce: string): boolean {
  // Nonce should be 64 hex characters (32 bytes)
  return /^[a-f0-9]{64}$/i.test(nonce);
}

/**
 * Hash lease for storage/comparison
 * 
 * @param lease - Lease object
 * @returns SHA-256 hash
 */
export function hashLease(lease: SignedLease): string {
  const canonical = canonicalJSON(lease);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Calculate lease expiry time
 * 
 * @param durationSeconds - Duration in seconds
 * @returns ISO 8601 timestamp
 */
export function calculateLeaseExpiry(durationSeconds: number): string {
  const expiryDate = new Date(Date.now() + durationSeconds * 1000);
  return expiryDate.toISOString();
}

/**
 * Check if lease is expired
 * 
 * @param expiresAt - ISO 8601 timestamp
 * @returns True if expired
 */
export function isLeaseExpired(expiresAt: string): boolean {
  return Date.now() > new Date(expiresAt).getTime();
}

/**
 * Get remaining lease time in seconds
 * 
 * @param expiresAt - ISO 8601 timestamp
 * @returns Seconds remaining (0 if expired)
 */
export function getRemainingLeaseTime(expiresAt: string): number {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(remaining / 1000));
}
