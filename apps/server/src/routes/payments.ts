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
import { completeResourceOrderItem, markServicePurchasePaid, CommerceError } from "../lib/commerce";
import { reqLog } from "../middleware/requestId";

const router: Router = Router();

// POST /payments/create - Create payment (authenticated)
// Accepts { purchaseId } for resource lines (legacy) or { servicePurchaseId }
// for service lines (C-010). The provider amount is always the FINAL total.
router.post("/create", authenticate, standardRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { purchaseId, servicePurchaseId } = req.body;

    if (!purchaseId && !servicePurchaseId) {
      res.status(400).json({ error: "Missing purchaseId or servicePurchaseId" });
      return;
    }

    // ---- Service payment (C-010) ----
    if (servicePurchaseId) {
      const servicePurchase = await db.orm.public.ServicePurchase
        .where({ id: servicePurchaseId })
        .first();
      if (!servicePurchase) {
        res.status(404).json({ error: "Service purchase not found" });
        return;
      }
      if (servicePurchase.buyerId !== req.user!.userId) {
        res.status(403).json({ error: "Not authorized" });
        return;
      }
      if (servicePurchase.status !== "PENDING") {
        res.status(400).json({ error: "Service purchase is not pending" });
        return;
      }
      const serviceOrderItem = await db.orm.public.ServiceOrderItem
        .where({ id: servicePurchase.serviceOrderItemId })
        .first();
      if (!serviceOrderItem?.orderItemId) {
        res.status(409).json({ error: "Service purchase has no checkout order item" });
        return;
      }

      if (!YOOKASSA_ENABLED) {
        res.json({
          message: "YooKassa disabled - service order awaits manual payment setup",
          servicePurchaseId: servicePurchase.id,
        });
        return;
      }

      const payment = await createYooKassaPayment({
        amount: servicePurchase.finalPrice,
        description: `Заказ услуги`,
        orderId: servicePurchase.id,
        returnUrl: `${process.env.FRONTEND_URL}/services/orders/${servicePurchase.id}`,
      });

      await db.orm.public.Payment.create({
        purchaseId: null,
        orderItemId: serviceOrderItem.orderItemId,
        provider: "YUKASSA",
        providerPaymentId: payment.id,
        amount: servicePurchase.finalPrice,
        currency: "RUB",
        status: "PENDING",
      });

      res.json({
        paymentUrl: payment.confirmation.confirmation_url,
        paymentId: payment.id,
      });
      return;
    }

    // ---- Resource payment (legacy contract, kept compatible) ----
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
      // TASK A-011: the provider amount must equal the order FINAL total
      // (after discounts) — never the pre-discount snapshot.
      const payment = await createYooKassaPayment({
        amount: purchase.finalPrice,
        description: `Покупка ресурса: ${resource.title}`,
        orderId: purchase.id.toString(),
        returnUrl: `${process.env.FRONTEND_URL}/purchases/${purchase.id}`,
      });

      // Save payment info
      await db.orm.public.Payment.create({
        purchaseId: purchase.id,
        provider: "YUKASSA",
        providerPaymentId: payment.id,
        amount: purchase.finalPrice,
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
    reqLog(req).error("payment_create_failed", { error });
    res.status(500).json({ error: "Failed to create payment" });
  }
});

// POST /payments/webhook - YooKassa webhook
// YooKassa sends HTTP Basic Auth notifications configured in its dashboard.
// We verify IP whitelist, Basic Auth, record idempotency event, and confirm
// payment state via the provider API. Repeated deliveries are safe.
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    // TASK A-010: when the provider is not configured there is no way to
    // verify transport authenticity or re-fetch provider state — the endpoint
    // must be DISABLED, not open. (Previously the IP/auth/re-fetch checks were
    // all skipped when YOOKASSA_ENABLED=false, leaving an unauthenticated
    // purchase-completion bypass.)
    if (!YOOKASSA_ENABLED) {
      res.status(503).json({ error: "Payment provider is not configured" });
      return;
    }

    // Security Layer 1: IP Whitelist
    const clientIP = getClientIP(req);
    if (!isYooKassaIP(clientIP)) {
      reqLog(req).warn("webhook_rejected_ip_not_whitelisted", { client_ip: clientIP });
      res.status(403).json({ error: "Forbidden: Invalid source IP" });
      return;
    }

    // Security Layer 2: Basic Auth
    const notificationPassword = process.env.YOOKASSA_NOTIFICATION_PASSWORD || "";
    if (!verifyYooKassaAuth(req.headers.authorization, YOOKASSA_SHOP_ID, notificationPassword)) {
      reqLog(req).warn("webhook_rejected_invalid_auth", { client_ip: clientIP });
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

    const orderRef = orderId;

    // The reference is either a resource Purchase id (legacy + current
    // resource checkouts) or a ServicePurchase id (C-010 service orders).
    const purchase = await db.orm.public.Purchase.where({ id: orderRef }).first();
    const servicePurchase = purchase
      ? null
      : await db.orm.public.ServicePurchase.where({ id: orderRef }).first();

    if (!purchase && !servicePurchase) {
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "FAILED",
        lastError: `Order not found: ${orderRef}`,
      });
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Do not trust webhook body alone. Confirm current provider state and amount.
    // TASK A-010/A-011: provider re-fetch + amount/currency/reference invariants.
    const providerPayment = await getYooKassaPayment(object.id);
    const expectedEntity = purchase ?? servicePurchase!;
    const expectedAmount = (expectedEntity.finalPrice / 100).toFixed(2);
    if (providerPayment.status !== "succeeded" || providerPayment.paid !== true) {
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "FAILED",
        lastError: "Provider payment is not succeeded",
      });
      res.status(409).json({ error: "Provider payment is not succeeded" });
      return;
    }
    if (
      providerPayment.amount.value !== expectedAmount ||
      providerPayment.amount.currency !== "RUB"
    ) {
      // TASK A-011: amount/currency mismatch -> quarantine, no entitlement.
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "FAILED",
        lastError: `Amount mismatch: provider ${providerPayment.amount.value} ${providerPayment.amount.currency}, expected ${expectedAmount} RUB`,
      });
      reqLog(req).error("payment_quarantined_amount_mismatch", {
        provider_payment_id: object.id,
        provider_amount: providerPayment.amount.value,
        provider_currency: providerPayment.amount.currency,
        expected_amount: expectedAmount,
        order_ref: orderRef,
      });
      res.status(409).json({ error: "Provider payment amount mismatch" });
      return;
    }

    // TASK A-011: the provider payment reference must belong to THIS order.
    const existingPayment = await db.orm.public.Payment.where({
      providerPaymentId: object.id,
    }).first();
    if (existingPayment) {
      const boundRef = existingPayment.purchaseId ?? existingPayment.orderItemId;
      const belongsHere =
        (purchase && existingPayment.purchaseId === purchase.id) ||
        (servicePurchase &&
          existingPayment.orderItemId != null &&
          (await db.orm.public.ServiceOrderItem.where({
            id: servicePurchase.serviceOrderItemId,
          }).first())?.orderItemId === existingPayment.orderItemId);
      if (!belongsHere) {
        await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
          status: "FAILED",
          lastError: `Payment ${object.id} is bound to order ${String(boundRef)}, webhook claims ${orderRef}`,
        });
        reqLog(req).error("payment_quarantined_reference_mismatch", {
          provider_payment_id: object.id,
          bound_order_ref: String(boundRef),
          claimed_order_ref: orderRef,
        });
        res.status(409).json({ error: "Payment reference mismatch" });
        return;
      }
    }

    if (purchase) {
      // ---- Resource completion (atomic; INV-001/INV-006) ----
      if (!purchase.orderItemId) {
        await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
          status: "FAILED",
          lastError: `Purchase ${purchase.id} has no checkout order item`,
        });
        res.status(409).json({ error: "Purchase has no checkout order item" });
        return;
      }

      const completion = await completeResourceOrderItem(purchase.orderItemId);

      if (existingPayment) {
        await db.orm.public.Payment.where({ providerPaymentId: object.id }).update({
          status: "SUCCEEDED",
        });
      } else {
        // Provider-confirmed payment without a local record (e.g. created via
        // the provider dashboard): persist it bound to this purchase.
        await db.orm.public.Payment.create({
          purchaseId: purchase.id,
          provider: "YUKASSA",
          providerPaymentId: object.id,
          amount: purchase.finalPrice,
          currency: "RUB",
          status: "SUCCEEDED",
        });
      }

      const user = await db.orm.public.User.where({ id: purchase.buyerId }).first();
      const resource = await db.orm.public.Resource.where({ id: purchase.resourceId }).first();
      if (
        !completion.alreadyCompleted &&
        user &&
        resource &&
        user.email &&
        completion.licenseId
      ) {
        sendPurchaseEmail(user.email, resource.title, completion.licenseId).catch((err) =>
          reqLog(req).error("purchase_email_send_failed", { purchase_id: purchase.id, error: err })
        );
      }
    } else if (servicePurchase) {
      // ---- Service completion: PENDING -> IN_PROGRESS (C-009/C-010) ----
      await markServicePurchasePaid(servicePurchase.id);

      if (existingPayment) {
        await db.orm.public.Payment.where({ providerPaymentId: object.id }).update({
          status: "SUCCEEDED",
        });
      } else {
        const serviceOrderItem = await db.orm.public.ServiceOrderItem
          .where({ id: servicePurchase.serviceOrderItemId })
          .first();
        await db.orm.public.Payment.create({
          purchaseId: null,
          orderItemId: serviceOrderItem?.orderItemId ?? null,
          provider: "YUKASSA",
          providerPaymentId: object.id,
          amount: servicePurchase.finalPrice,
          currency: "RUB",
          status: "SUCCEEDED",
        });
      }
    }

    await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
      status: "PROCESSED",
      processedAt: new Date().toISOString(),
    });

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    if (error instanceof CommerceError) {
      reqLog(req).warn("webhook_completion_rejected", { code: error.code, status: error.status });
      res.status(error.status).json({ error: error.message });
      return;
    }
    reqLog(req).error("webhook_processing_failed", { error });
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

        if (!purchase.orderItemId) {
          res.status(409).json({ error: "Purchase has no checkout order item" });
          return;
        }

        // Atomic completion through the shared commerce path (C-003/C-012).
        const completion = await completeResourceOrderItem(purchase.orderItemId);

        res.json({
          message: "Payment simulated successfully",
          purchaseId: purchase.id,
          licenseId: completion.licenseId,
        });
      } catch (error) {
        if (error instanceof CommerceError) {
          reqLog(req).warn("payment_simulation_rejected", { code: error.code, status: error.status });
          res.status(error.status).json({ error: error.message, code: error.code });
          return;
        }
        reqLog(req).error("payment_simulation_failed", { error });
        res.status(500).json({ error: "Failed to simulate payment" });
      }
    }
  );
}

export default router;
