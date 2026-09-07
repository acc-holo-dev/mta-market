#!/usr/bin/env tsx
/**
 * TASK-019: Artifact Signing CLI Tool
 * 
 * Command-line tool for managing publisher keys and signing artifacts.
 * 
 * Usage:
 *   pnpm artifact:keygen --seller-id <id>
 *   pnpm artifact:sign --file <path> --version-id <id> --private-key <key>
 *   pnpm artifact:verify --file <path> --version-id <id>
 */

import { Command } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { 
  createPublisherKey, 
  signAndStoreArtifact, 
  verifyStoredArtifact,
  getPublisherKeys,
  revokePublisherKey
} from '../lib/artifact';

const program = new Command();

program
  .name('artifact-cli')
  .description('CLI tool for artifact signing and key management')
  .version('1.0.0');

// Generate keypair
program
  .command('keygen')
  .description('Generate Ed25519 keypair for seller')
  .requiredOption('--seller-id <id>', 'Seller user ID')
  .option('--output <path>', 'Output file for private key', '.keys')
  .action(async (options) => {
    try {
      console.log('🔑 Generating Ed25519 keypair...');
      
      const result = await createPublisherKey(options.sellerId);
      
      console.log('✅ Keypair generated successfully!');
      console.log(`📋 Key ID: ${result.keyId}`);
      console.log(`🔓 Public Key: ${result.publicKey.substring(0, 20)}...`);
      
      // Save private key to file
      const keyFile = join(process.cwd(), options.output, `${options.sellerId}.key`);
      await writeFile(keyFile, JSON.stringify({
        keyId: result.keyId,
        sellerId: options.sellerId,
        publicKey: result.publicKey,
        privateKey: result.privateKey,
        createdAt: new Date().toISOString()
      }, null, 2));
      
      console.log(`🔐 Private key saved to: ${keyFile}`);
      console.log('');
      console.log('⚠️  IMPORTANT: Store private key securely!');
      console.log('   - Never commit to git');
      console.log('   - Never expose to clients');
      console.log('   - Consider using KMS/Vault in production');
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Sign artifact
program
  .command('sign')
  .description('Sign artifact file')
  .requiredOption('--file <path>', 'Path to artifact file')
  .requiredOption('--version-id <id>', 'ResourceVersion ID')
  .requiredOption('--private-key <key>', 'Base64 encoded private key or path to key file')
  .action(async (options) => {
    try {
      console.log('📝 Signing artifact...');
      
      // Read artifact file
      const artifactBuffer = await readFile(options.file);
      console.log(`📦 Artifact size: ${(artifactBuffer.length / 1024).toFixed(2)} KB`);
      
      // Get private key
      let privateKey = options.privateKey;
      if (options.privateKey.startsWith('.') || options.privateKey.startsWith('/')) {
        // Load from file
        const keyData = JSON.parse(await readFile(options.privateKey, 'utf-8'));
        privateKey = keyData.privateKey;
      }
      
      // Sign artifact
      const result = await signAndStoreArtifact(
        options.versionId,
        artifactBuffer,
        privateKey
      );
      
      console.log('✅ Artifact signed successfully!');
      console.log(`📋 Manifest Hash: ${result.manifestHash}`);
      console.log(`📋 Artifact Hash: ${result.artifactHash}`);
      console.log(`🔏 Signature: ${result.signature.substring(0, 20)}...`);
      
      // Save manifest to file
      const manifestFile = options.file + '.manifest.json';
      await writeFile(manifestFile, JSON.stringify(result.manifest, null, 2));
      console.log(`📄 Manifest saved to: ${manifestFile}`);
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Verify artifact
program
  .command('verify')
  .description('Verify artifact signature')
  .requiredOption('--file <path>', 'Path to artifact file')
  .requiredOption('--version-id <id>', 'ResourceVersion ID')
  .action(async (options) => {
    try {
      console.log('🔍 Verifying artifact...');
      
      // Read artifact file
      const artifactBuffer = await readFile(options.file);
      
      // Verify signature
      const result = await verifyStoredArtifact(options.versionId, artifactBuffer);
      
      if (result.valid) {
        console.log('✅ Signature valid!');
        console.log(`✓ Algorithm: ${result.signature?.algorithm}`);
        console.log(`✓ Key ID: ${result.signature?.keyId}`);
        console.log(`✓ Manifest format: v${result.manifest?.formatVersion}`);
      } else {
        console.log('❌ Signature invalid!');
        console.log('Errors:', result.errors.join(', '));
      }
      
      if (result.warnings.length > 0) {
        console.log('⚠️  Warnings:', result.warnings.join(', '));
      }
      
      process.exit(result.valid ? 0 : 1);
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// List keys
program
  .command('keys')
  .description('List publisher keys for seller')
  .requiredOption('--seller-id <id>', 'Seller user ID')
  .action(async (options) => {
    try {
      const keys = await getPublisherKeys(options.sellerId);
      
      if (keys.length === 0) {
        console.log('No keys found for seller');
        return;
      }
      
      console.log(`Found ${keys.length} key(s):\n`);
      
      for (const key of keys) {
        console.log(`🔑 Key ID: ${key.id}`);
        console.log(`   Status: ${key.status}`);
        console.log(`   Type: ${key.keyType}`);
        console.log(`   Created: ${key.createdAt}`);
        if (key.revokedAt) {
          console.log(`   Revoked: ${key.revokedAt}`);
          console.log(`   Reason: ${key.revocationReason}`);
        }
        console.log('');
      }
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Revoke key
program
  .command('revoke')
  .description('Revoke publisher key')
  .requiredOption('--key-id <id>', 'PublisherKey ID')
  .requiredOption('--revoked-by <id>', 'User ID who revokes the key')
  .requiredOption('--reason <reason>', 'Revocation reason')
  .action(async (options) => {
    try {
      await revokePublisherKey(options.keyId, options.revokedBy, options.reason);
      console.log('✅ Key revoked successfully');
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program.parse();
