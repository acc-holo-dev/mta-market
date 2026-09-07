// CUID validation middleware
import { Request, Response, NextFunction } from "express";

/**
 * CUID format: starts with 'c' followed by 24 alphanumeric characters
 * Example: clx3r2k8n0000qzrm5g4j9k2p
 */
const CUID_REGEX = /^c[a-z0-9]{24}$/i;

/**
 * Validates that a route parameter is a valid CUID format
 * @param paramName - Name of the route parameter to validate (e.g., 'id', 'userId', 'resourceId')
 * @returns Express middleware function
 * 
 * @example
 * router.get('/users/:id', validateCuid('id'), handler);
 * router.patch('/resources/:resourceId', validateCuid('resourceId'), handler);
 */
export function validateCuid(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];

    if (!value) {
      res.status(400).json({ 
        error: 'Missing parameter',
        message: `Route parameter '${paramName}' is required`,
      });
      return;
    }

    if (!CUID_REGEX.test(value)) {
      res.status(400).json({ 
        error: 'Invalid ID format',
        message: `Parameter '${paramName}' must be a valid CUID (e.g., clx3r2k8n0000qzrm5g4j9k2p)`,
        received: value,
      });
      return;
    }

    next();
  };
}

/**
 * Validates multiple CUID parameters at once
 * @param paramNames - Array of parameter names to validate
 * @returns Express middleware function
 * 
 * @example
 * router.post('/licenses/:licenseId/installations/:installationId', 
 *   validateCuids(['licenseId', 'installationId']), 
 *   handler
 * );
 */
export function validateCuids(paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const paramName of paramNames) {
      const value = req.params[paramName];

      if (!value) {
        res.status(400).json({ 
          error: 'Missing parameter',
          message: `Route parameter '${paramName}' is required`,
        });
        return;
      }

      if (!CUID_REGEX.test(value)) {
        res.status(400).json({ 
          error: 'Invalid ID format',
          message: `Parameter '${paramName}' must be a valid CUID`,
          received: value,
        });
        return;
      }
    }

    next();
  };
}

/**
 * Check if a string is a valid CUID (utility function)
 * @param value - String to validate
 * @returns true if valid CUID format
 */
export function isCuid(value: string): boolean {
  return CUID_REGEX.test(value);
}
