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

// NOTE: the signing service (signing.ts) is parked in src/attic until
// PLAN Phase B (B-002) integrates it with the contract ORM API.
