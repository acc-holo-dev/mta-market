// Payment webhooks (YooKassa)
import { Router, Request, Response } from "express";
import { db } from "../prisma/db";
import {
  createYooKassaPayment,
  verifyYooKassaWebhook,
  YOOKASSA_ENABLED,
  YooKassaWebhook,
} from "../lib/yookassa";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { sendPurchaseEmail } from "../lib/email";

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
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-yookassa-signature"] as string;
    const body = JSON.stringify(req.body);

    // Verify signature
    if (!verifyYooKassaWebhook(body, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    const webhook: YooKassaWebhook = req.body;

    if (webhook.event !== "payment.succeeded") {
      res.json({ message: "Event ignored" });
      return;
    }

    const { object } = webhook;
    const orderId = parseInt(object.metadata.order_id, 10);

    // Get purchase
    const purchase = await db.orm.public.Purchase.where({ id: orderId }).first();

    if (!purchase) {
      res.status(404).json({ error: "Purchase not found" });
      return;
    }

    if (purchase.status === "COMPLETED") {
      res.json({ message: "Purchase already completed" });
      return;
    }

    // Complete purchase
    const completedAt = new Date().toISOString();
    await db.orm.public.Purchase.where({ id: orderId }).update({
      status: "COMPLETED",
      completedAt,
    });

    // Update payment status
    await db.orm.public.Payment.where({ providerPaymentId: object.id }).update({
      status: "SUCCEEDED",
    });

    // Create license
    const license = await db.orm.public.License.create({
      purchaseId: purchase.id,
      versionId: purchase.versionId,
      status: "ACTIVE",
    });

    // Create financial transactions (simplified)
    // In production: proper double-entry bookkeeping
    await db.orm.public.FinancialTransaction.create({
      userId: purchase.buyerId,
      type: "PAYMENT_RECEIVED",
      amount: purchase.priceSnapshot,
      balanceAfter: 0, // TODO: calculate actual balance
      relatedPurchaseId: purchase.id,
    });

    // Send purchase email
    const user = await db.orm.public.User.where({ id: purchase.buyerId }).first();

    const resource = await db.orm.public.Resource.where({ id: purchase.resourceId }).first();

    if (user && resource && user.email) {
      sendPurchaseEmail(user.email, resource.title, license.id).catch((err) =>
        console.error("Failed to send purchase email:", err)
      );
    }

    console.log(`Payment succeeded: purchaseId=${orderId}, licenseId=${license.id}`);

    res.json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

// POST /payments/:id/simulate - Simulate payment (development only)
router.post(
  "/:id/simulate",
  authenticate,
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      if (YOOKASSA_ENABLED) {
        res.status(403).json({ error: "Cannot simulate in production" });
        return;
      }

      const purchaseId = parseInt(req.params.id as string, 10);

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

      // Create financial transaction
      await db.orm.public.FinancialTransaction.create({
        userId: purchase.buyerId,
        type: "PAYMENT_RECEIVED",
        amount: purchase.priceSnapshot,
        balanceAfter: 0, // TODO: calculate actual balance
        relatedPurchaseId: purchase.id,
      });

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

export default router;
