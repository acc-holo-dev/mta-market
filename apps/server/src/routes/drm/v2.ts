/**
 * TASK-020: DRM Protocol v2 Routes
 * 
 * API endpoints for DRM v2 protocol.
 */

import { Router, Request, Response } from 'express';
import {
  registerInstallation,
  verifyInstallation,
  activateLicense,
  recordHeartbeat,
  getServerPublicKey,
  getActiveLease
} from '../lib/drm/service';
import { DRM_ERROR_CODES } from '../lib/drm/types';

const router = Router();

/**
 * GET /drm/v2/public-key
 * 
 * Get server's public key for lease verification
 */
router.get('/v2/public-key', async (req: Request, res: Response) => {
  try {
    const publicKey = await getServerPublicKey();
    
    res.json({
      publicKey,
      algorithm: 'EdDSA',
      keyType: 'ED25519'
    });
  } catch (error) {
    console.error('Get public key error:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve server public key'
      }
    });
  }
});

/**
 * POST /drm/v2/installations
 * 
 * Register new installation with public key
 */
router.post('/v2/installations', async (req: Request, res: Response) => {
  try {
    const { publicKey, mtaVersion, moduleVersion, serverSerial, serverName } = req.body;
    
    // Validation
    if (!publicKey || !mtaVersion || !moduleVersion) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required fields: publicKey, mtaVersion, moduleVersion'
        }
      });
    }
    
    const result = await registerInstallation({
      publicKey,
      mtaVersion,
      moduleVersion,
      serverSerial,
      serverName
    });
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Installation registration error:', error);
    
    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({
        error: {
          code: 'INSTALLATION_EXISTS',
          message: error.message
        }
      });
    }
    
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to register installation'
      }
    });
  }
});

/**
 * POST /drm/v2/installations/:id/verify
 * 
 * Verify installation with challenge response
 */
router.post('/v2/installations/:id/verify', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { challengeResponse } = req.body;
    
    if (!challengeResponse) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing challengeResponse'
        }
      });
    }
    
    const result = await verifyInstallation({
      installationId: id,
      challengeResponse
    });
    
    res.json(result);
  } catch (error) {
    console.error('Installation verification error:', error);
    
    if (error instanceof Error) {
      if (error.message === DRM_ERROR_CODES.INSTALLATION_NOT_FOUND) {
        return res.status(404).json({
          error: {
            code: error.message,
            message: 'Installation not found'
          }
        });
      }
      
      if (error.message === DRM_ERROR_CODES.INVALID_CHALLENGE_RESPONSE) {
        return res.status(401).json({
          error: {
            code: error.message,
            message: 'Invalid challenge response signature'
          }
        });
      }
    }
    
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to verify installation'
      }
    });
  }
});

/**
 * POST /drm/v2/activate
 * 
 * Activate license and get signed lease
 */
router.post('/v2/activate', async (req: Request, res: Response) => {
  try {
    const { licenseId, installationId, nonce } = req.body;
    
    // Validation
    if (!licenseId || !installationId || !nonce) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required fields: licenseId, installationId, nonce'
        }
      });
    }
    
    // Get server private key from environment
    const privateKey = process.env.DRM_SERVER_PRIVATE_KEY;
    if (!privateKey) {
      console.error('DRM_SERVER_PRIVATE_KEY not configured');
      return res.status(500).json({
        error: {
          code: 'SERVER_MISCONFIGURED',
          message: 'Server signing key not configured'
        }
      });
    }
    
    const lease = await activateLicense(
      { licenseId, installationId, nonce },
      privateKey
    );
    
    res.json(lease);
  } catch (error) {
    console.error('License activation error:', error);
    
    if (error instanceof Error) {
      // Map known errors
      const errorMap: Record<string, number> = {
        [DRM_ERROR_CODES.INSTALLATION_NOT_FOUND]: 404,
        [DRM_ERROR_CODES.INSTALLATION_NOT_VERIFIED]: 403,
        [DRM_ERROR_CODES.INVALID_LICENSE]: 404,
        [DRM_ERROR_CODES.NONCE_ALREADY_USED]: 409
      };
      
      const statusCode = errorMap[error.message] || 400;
      
      return res.status(statusCode).json({
        error: {
          code: error.message,
          message: error.message.replace(/_/g, ' ').toLowerCase()
        }
      });
    }
    
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to activate license'
      }
    });
  }
});

/**
 * POST /drm/v2/heartbeat
 * 
 * Record installation heartbeat
 */
router.post('/v2/heartbeat', async (req: Request, res: Response) => {
  try {
    const { installationId, resourceId, uptime, lastError } = req.body;
    
    if (!installationId || !resourceId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required fields: installationId, resourceId'
        }
      });
    }
    
    const result = await recordHeartbeat({
      installationId,
      resourceId,
      uptime: uptime || 0,
      lastError
    });
    
    res.json(result);
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to record heartbeat'
      }
    });
  }
});

/**
 * GET /drm/v2/leases/:installationId/:resourceId
 * 
 * Get active lease for installation and resource
 */
router.get('/v2/leases/:installationId/:resourceId', async (req: Request, res: Response) => {
  try {
    const { installationId, resourceId } = req.params;
    
    const lease = await getActiveLease(installationId, resourceId);
    
    if (!lease) {
      return res.status(404).json({
        error: {
          code: 'LEASE_NOT_FOUND',
          message: 'No active lease found'
        }
      });
    }
    
    res.json(lease);
  } catch (error) {
    console.error('Get lease error:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve lease'
      }
    });
  }
});

export default router;
