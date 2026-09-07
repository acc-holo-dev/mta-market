// Payment webhooks (YooKassa)
import { Router, Request, Response } from "express";
import { db } from "../prisma/db";
import {
  createYooKassaPayment,
  getYooKassaPayment,
  YOOKASSA_ENABLED,
  YOOKASSA_SHOP_ID,
  YooKassaWebhook,
} from "../lib/yookassa";
import crypto from "crypto";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { validateCuid } from "../middleware/validateCuid";
import { isYooKassaIP, verifyYooKassaAuth, getClientIP } from "../lib/yookassaWebhook";
import { sendPurchaseEmail } from "../lib/email";
import { settlePurchaseRevenue } from "../lib/ledger";

const router: Router = Router();

// POST /payments/create - Create payment (authenticated)
router.post("/create", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { purchaseId } = req.body;

    if (!purchaseId) {
      res.status(400).json({ error: "Missing purchaseId" });
      return;
    }

    const purchase = await db.orm.public.Purchase.where({ id: purchaseId }).first();

    if (!purchase) {
      res.status(404).json({ error: "Purchase not found" });
      return;
    }

    if (purchase.buyerId !== req.user!.userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    if (purchase.status !== "PENDING") {
      res.status(400).json({ error: "Purchase is not pending" });
      return;
    }

    // Get resource info
    const resource = await db.orm.public.Resource.where({ id: purchase.resourceId }).first();

    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    if (YOOKASSA_ENABLED) {
      // Create payment in YooKassa
      const payment = await createYooKassaPayment({
        amount: purchase.priceSnapshot,
        description: `Покупка ресурса: ${resource.title}`,
        orderId: purchase.id.toString(),
        returnUrl: `${process.env.FRONTEND_URL}/purchases/${purchase.id}`,
      });

      // Save payment info
      await db.orm.public.Payment.create({
        purchaseId: purchase.id,
        provider: "YUKASSA",
        providerPaymentId: payment.id,
        amount: purchase.priceSnapshot,
        currency: "RUB",
        status: "PENDING",
      });

      res.json({
        paymentUrl: payment.confirmation.confirmation_url,
        paymentId: payment.id,
      });
    } else {
      // Development mode: simulate payment
      res.json({
        message: "YooKassa disabled - use /payments/:id/simulate for testing",
        purchaseId: purchase.id,
      });
    }
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({ error: "Failed to create payment" });
  }
});

// POST /payments/webhook - YooKassa webhook
// YooKassa sends HTTP Basic Auth notifications configured in its dashboard.
// We verify IP whitelist, Basic Auth, record idempotency event, and confirm
// payment state via the provider API. Repeated deliveries are safe.
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    // Security Layer 1: IP Whitelist
    const clientIP = getClientIP(req);
    if (YOOKASSA_ENABLED && !isYooKassaIP(clientIP)) {
      console.warn(`Webhook rejected: IP ${clientIP} not in YooKassa whitelist`);
      res.status(403).json({ error: "Forbidden: Invalid source IP" });
      return;
    }

    // Security Layer 2: Basic Auth
    const notificationPassword = process.env.YOOKASSA_NOTIFICATION_PASSWORD || "";
    if (YOOKASSA_ENABLED && !verifyYooKassaAuth(req.headers.authorization, YOOKASSA_SHOP_ID, notificationPassword)) {
      console.warn(`Webhook rejected: Invalid Basic Auth from ${clientIP}`);
      res.status(401).json({ error: "Unauthorized: Invalid credentials" });
      return;
    }

    const webhook: YooKassaWebhook = req.body;

    if (!webhook?.event || !webhook.object?.id) {
      res.status(400).json({ error: "Invalid webhook payload" });
      return;
    }

    const { object } = webhook;
    const eventType = webhook.event;
    const payloadHash = crypto.createHash("sha256").update(JSON.stringify(req.body)).digest("hex");

    // Persist event before applying business effects. Repeated deliveries are safe.
    const existingEvent = await db.orm.public.PaymentProviderEvent.where({
      provider: "YUKASSA",
      providerEventId: object.id,
      eventType,
    }).first();

    if (existingEvent?.status === "PROCESSED") {
      res.status(200).json({ message: "Event already processed" });
      return;
    }

    let eventRecord = existingEvent;
    if (!eventRecord) {
      eventRecord = await db.orm.public.PaymentProviderEvent.create({
        provider: "YUKASSA",
        providerEventId: object.id,
        objectId: object.id,
        eventType,
        objectType: "payment",
        payloadHash,
        payload: req.body,
        status: "PROCESSING",
        attempts: 1,
      });
    } else {
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "PROCESSING",
        attempts: eventRecord.attempts + 1,
        lastError: null,
      });
    }

    if (eventType !== "payment.succeeded") {
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "PROCESSED",
        processedAt: new Date().toISOString(),
      });
      res.status(200).json({ message: "Event acknowledged" });
      return;
    }

    const orderId = object.metadata?.order_id;
    if (!orderId) {
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "FAILED",
        lastError: "Missing order_id",
      });
      res.status(400).json({ error: "Missing order_id" });
      return;
    }

    const purchaseId = orderId;
    if (!purchaseId) {
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "FAILED",
        lastError: `Invalid order_id: ${orderId}`,
      });
      res.status(400).json({ error: "Invalid order_id" });
      return;
    }

    const purchase = await db.orm.public.Purchase.where({ id: purchaseId }).first();
    if (!purchase) {
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "FAILED",
        lastError: `Purchase not found: ${purchaseId}`,
      });
      res.status(404).json({ error: "Purchase not found" });
      return;
    }

    // Do not trust webhook body alone. Confirm current provider state and amount.
    if (YOOKASSA_ENABLED) {
      const providerPayment = await getYooKassaPayment(object.id);
      const expectedAmount = (purchase.priceSnapshot / 100).toFixed(2);
      if (providerPayment.status !== "succeeded" || providerPayment.paid !== true) {
        res.status(409).json({ error: "Provider payment is not succeeded" });
        return;
      }
      if (
        providerPayment.amount.value !== expectedAmount ||
        providerPayment.amount.currency !== "RUB"
      ) {
        res.status(409).json({ error: "Provider payment amount mismatch" });
        return;
      }
    }

    if (purchase.status === "COMPLETED") {
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "PROCESSED",
        processedAt: new Date().toISOString(),
      });
      res.status(200).json({ message: "Purchase already completed" });
      return;
    }

    const completedAt = new Date().toISOString();
    await db.orm.public.Purchase.where({ id: purchaseId }).update({
      status: "COMPLETED",
      completedAt,
    });

    await db.orm.public.Payment.where({ providerPaymentId: object.id }).update({
      status: "SUCCEEDED",
    });

    const license = await db.orm.public.License.create({
      purchaseId: purchase.id,
      versionId: purchase.versionId,
      status: "ACTIVE",
    });

    // Settle revenue: seller gets sellerRevenue, platform keeps platformFee.
    // Uses immutable purchase snapshot; validates fee invariants.
    await settlePurchaseRevenue(purchase);

    const user = await db.orm.public.User.where({ id: purchase.buyerId }).first();
    const resource = await db.orm.public.Resource.where({ id: purchase.resourceId }).first();
    if (user && resource && user.email) {
      sendPurchaseEmail(user.email, resource.title, license.id).catch((err) =>
        console.error("Failed to send purchase email:", err)
      );
    }

    await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
      status: "PROCESSED",
      processedAt: new Date().toISOString(),
    });

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

// POST /payments/:id/simulate - Simulate payment (development only)
// This route is ONLY compiled in non-production environments
if (process.env.NODE_ENV !== 'production') {
  router.post(
    "/:id/simulate",
    authenticate,
    validateCuid('id'),
    standardRateLimit,
    async (req: AuthRequest, res: Response) => {
      try {
        if (YOOKASSA_ENABLED) {
          res.status(403).json({ error: "Cannot simulate in production" });
          return;
        }

        const purchaseId = req.params.id as string;

        const purchase = await db.orm.public.Purchase.where({ id: purchaseId }).first();

        if (!purchase) {
          res.status(404).json({ error: "Purchase not found" });
          return;
        }

        if (purchase.buyerId !== req.user!.userId) {
          res.status(403).json({ error: "Not authorized" });
          return;
        }

        if (purchase.status !== "PENDING") {
          res.status(400).json({ error: "Purchase is not pending" });
          return;
        }

        // Complete purchase
        const completedAt = new Date().toISOString();
        await db.orm.public.Purchase.where({ id: purchaseId }).update({
          status: "COMPLETED",
          completedAt,
        });

        // Create license
        const license = await db.orm.public.License.create({
          purchaseId: purchase.id,
          versionId: purchase.versionId,
          status: "ACTIVE",
        });

        // Settle revenue (same flow as real payment)
        await settlePurchaseRevenue(purchase);

        res.json({
          message: "Payment simulated successfully",
          purchaseId: purchase.id,
          licenseId: license.id,
        });
      } catch (error) {
        console.error("Error simulating payment:", error);
        res.status(500).json({ error: "Failed to simulate payment" });
      }
    }
  );
}

export default router;
