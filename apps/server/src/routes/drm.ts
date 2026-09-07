// DRM API routes for MTA servers (License & Installation management)
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { strictRateLimit, standardRateLimit } from "../lib/rateLimit";
import { validateCuid } from "../middleware/validateCuid";
import { db } from "../prisma/db";
import crypto from "crypto";
import { sendLicenseActivatedEmail } from "../lib/email";

const router: Router = Router();

// POST /drm/activate - Activate license on MTA server
// SECURITY: Requires authentication to verify license ownership
router.post("/activate", authenticate, strictRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { licenseKey, serverSerial, serverName } = req.body;

    if (!licenseKey || !serverSerial) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Find license by purchaseId (simplified - in production use encrypted licenseKey)
    const license = await db.orm.public.License.where({ id: licenseKey }).first();

    if (!license) {
      res.status(404).json({ error: "Invalid license key" });
      return;
    }

    if (license.status !== "ACTIVE") {
      res.status(403).json({ error: "License is not active" });
      return;
    }

    // SECURITY: Verify ownership - user must own the purchase associated with this license
    const purchase = await db.orm.public.Purchase.where({ id: license.purchaseId }).first();

    if (!purchase) {
      res.status(500).json({ error: "Associated purchase not found" });
      return;
    }

    if (purchase.buyerId !== req.user!.userId) {
      console.warn(`License activation denied: User ${req.user!.userId} attempted to activate license ${license.id} owned by ${purchase.buyerId}`);
      res.status(403).json({ error: "Not authorized: You do not own this license" });
      return;
    }

    console.info(`License activation: User ${req.user!.userId} activating license ${license.id} on server ${serverSerial}`);

    // Check if license is already bound to another server
    if (license.serverSerial && license.serverSerial !== serverSerial) {
      res.status(403).json({ error: "License is already bound to another server" });
      return;
    }

    // Bind license to server if not bound
    if (!license.serverSerial) {
      await db.orm.public.License.where({ id: license.id }).update({
        serverSerial,
        activatedAt: new Date().toISOString(),
      });
    }

    // Check if installation already exists
    const existingInstallation = await db.orm.public.Installation.where({
      licenseId: license.id,
      serverSerial,
    }).first();

    if (existingInstallation) {
      res.json({
        publicKey: existingInstallation.publicKey,
        privateKey: existingInstallation.privateKey,
        status: "already_activated",
      });
      return;
    }

    // Generate keypair for this installation
    const publicKey = crypto.randomBytes(32).toString("hex");
    const privateKey = crypto.randomBytes(32).toString("hex");

    const installation = await db.orm.public.Installation.create({
      licenseId: license.id,
      publicKey,
      privateKey,
      serverSerial,
      serverName: serverName || null,
      status: "ACTIVE",
    });

    // Send license activation email
    const user = await db.orm.public.User.where({ id: purchase.buyerId }).first();
    const resource = await db.orm.public.Resource.where({ id: purchase.resourceId }).first();

    if (user && resource && user.email) {
      sendLicenseActivatedEmail(user.email, resource.title, serverName || serverSerial).catch(
        (err) => console.error("Failed to send activation email:", err)
      );
    }

    res.status(201).json({
      publicKey: installation.publicKey,
      privateKey: installation.privateKey,
      status: "activated",
    });
  } catch (error) {
    console.error("Error activating license:", error);
    res.status(500).json({ error: "Failed to activate license" });
  }
});

// POST /drm/verify - Verify installation keypair
router.post("/verify", standardRateLimit, async (req, res: Response) => {
  try {
    const { publicKey, privateKey, serverSerial } = req.body;

    if (!publicKey || !privateKey || !serverSerial) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const installation = await db.orm.public.Installation.where({
      publicKey,
      privateKey,
      serverSerial,
    }).first();

    if (!installation) {
      res.status(404).json({ valid: false, error: "Invalid installation" });
      return;
    }

    if (installation.status !== "ACTIVE") {
      res.status(403).json({ valid: false, error: "Installation is not active" });
      return;
    }

    // Get license info
    const license = await db.orm.public.License.where({ id: installation.licenseId }).first();

    if (!license || license.status !== "ACTIVE") {
      res.status(403).json({ valid: false, error: "License is not active" });
      return;
    }

    // Update heartbeat
    await db.orm.public.Installation.where({ id: installation.id }).update({
      lastHeartbeat: new Date().toISOString(),
    });

    res.json({
      valid: true,
      licenseId: license.id,
      expiresAt: license.expiresAt,
    });
  } catch (error) {
    console.error("Error verifying installation:", error);
    res.status(500).json({ error: "Failed to verify installation" });
  }
});

// GET /drm/my-licenses - Get user's licenses (authenticated)
router.get(
  "/my-licenses",
  authenticate,
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      // Get all purchases by user
      const purchases = await db.orm.public.Purchase.where({
        buyerId: req.user!.userId,
        status: "COMPLETED",
      }).all();

      // Get licenses for those purchases
      const licenses = [];
      for (const purchase of purchases) {
        const license = await db.orm.public.License.where({ purchaseId: purchase.id }).first();

        if (license) {
          // Get installations
          const installations = await db.orm.public.Installation.where({
            licenseId: license.id,
          }).all();

          licenses.push({
            licenseId: license.id,
            purchaseId: purchase.id,
            resourceId: purchase.resourceId,
            status: license.status,
            serverSerial: license.serverSerial,
            activatedAt: license.activatedAt,
            expiresAt: license.expiresAt,
            installations: installations.map((i) => ({
              serverSerial: i.serverSerial,
              serverName: i.serverName,
              status: i.status,
              installedAt: i.installedAt,
              lastHeartbeat: i.lastHeartbeat,
            })),
          });
        }
      }

      res.json(licenses);
    } catch (error) {
      console.error("Error fetching licenses:", error);
      res.status(500).json({ error: "Failed to fetch licenses" });
    }
  }
);

// DELETE /drm/revoke/:licenseId - Revoke license (authenticated, owner only)
router.delete(
  "/revoke/:licenseId",
  authenticate,
  validateCuid('licenseId'),
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const licenseId = req.params.licenseId as string;

      const license = await db.orm.public.License.where({ id: licenseId }).first();

      if (!license) {
        res.status(404).json({ error: "License not found" });
        return;
      }

      // Check ownership
      const purchase = await db.orm.public.Purchase.where({ id: license.purchaseId }).first();

      if (!purchase || purchase.buyerId !== req.user!.userId) {
        res.status(403).json({ error: "Not authorized" });
        return;
      }

      // Revoke license
      await db.orm.public.License.where({ id: licenseId }).update({
        status: "REVOKED",
        revokedAt: new Date().toISOString(),
      });

      // Revoke all installations
      const installations = await db.orm.public.Installation.where({ licenseId }).all();

      for (const installation of installations) {
        await db.orm.public.Installation.where({ id: installation.id }).update({
          status: "REVOKED",
        });
      }

      res.json({ message: "License revoked successfully" });
    } catch (error) {
      console.error("Error revoking license:", error);
      res.status(500).json({ error: "Failed to revoke license" });
    }
  }
);

export default router;
