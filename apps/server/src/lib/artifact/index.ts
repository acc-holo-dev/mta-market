/**
 * TASK-019: Artifact Signing Module
 * 
 * Complete artifact signing and verification system with Ed25519.
 */

// Export types
export * from './types';

// Export cryptography functions
export {
  generatePublisherKeypair,
  signArtifact,
  verifyArtifactSignature,
  hashManifest,
  canonicalJSON,
  hashFile,
  isValidPublicKey,
  isValidSignature
} from './crypto';

// Export manifest functions
export {
  generateManifest,
  attachSignatureMetadata,
  validateManifest,
  parseManifest,
  serializeManifest
} from './manifest';

// Export signing service (main API)
export {
  createPublisherKey,
  signAndStoreArtifact,
  verifyStoredArtifact,
  getManifest,
  revokePublisherKey,
  getPublisherKeys,
  getActivePublisherKey,
  hasValidSignature
} from './signing';
