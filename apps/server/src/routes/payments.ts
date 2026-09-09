// Payment routes (PLAN E-001..E-008).
// Routes talk to the neutral IPaymentProvider registry, never a provider SDK
// directly (E-002). Payment row mutations go through the state machine
// (E-003). Refunds are an independent lifecycle (E-008, INV-013).
import { Router, Request, Response } from "express";
import { db } from "../prisma/db";
import crypto from "crypto";
import { authenticate, requireRole, AuthRequest } from "../lib/auth";
import { standardRateLimit } from "../lib/rateLimit";
import { validateCuid } from "../middleware/validateCuid";
import { getClientIP } from "../lib/yookassaWebhook";
import { sendPurchaseEmail } from "../lib/email";
import { completeResourceOrderItem, markServicePurchasePaid, CommerceError } from "../lib/commerce";
import { paymentProviders, type IPaymentProvider } from "../lib/paymentProvider";
// E-002: side-effect import registers the YooKassa implementation.
import "../lib/providers/payment-yookassa";
import {
  assertTransition,
  canTransition,
  type PaymentState,
} from "../lib/paymentStateMachine";
import { createRefund } from "../lib/refunds";
import { PaymentRefundError } from "../lib/paymentErrors";
import { reqLog } from "../middleware/requestId";
import type { YooKassaWebhook } from "../lib/yookassa";

const router: Router = Router();

function yooKassaProvider(): IPaymentProvider | null {
  const provider = paymentProviders.get("YUKASSA");
  return provider && provider.isEnabled() ? provider : null;
}

/**
 * E-003: apply a state-machine transition to a Payment row. No-op when the
 * row is already in the target state; throws PaymentStateError on illegal
 * transitions ( surfacing as 500 — a programming error, not a client one).
 */
async function transitionPaymentTo(providerPaymentId: string, to: PaymentState): Promise<void> {
  const row = await db.orm.public.Payment.where({ providerPaymentId }).first();
  if (!row) return;
  const from = row.status as PaymentState;
  if (from === to) return;
  assertTransition(from, to);
  await db.orm.public.Payment.where({ id: row.id }).update({
    status: to,
    ...(to === "SUCCEEDED" ? { succeededAt: new Date().toISOString() } : {}),
    ...(to === "FAILED" ? { failedAt: new Date().toISOString() } : {}),
  });
}

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

    const provider = yooKassaProvider();

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

      if (!provider) {
        res.json({
          message: "YooKassa disabled - service order awaits manual payment setup",
          servicePurchaseId: servicePurchase.id,
        });
        return;
      }

      const created = await provider.createPayment({
        amount: { value: servicePurchase.finalPrice, currency: "RUB" },
        description: "Заказ услуги",
        orderId: servicePurchase.id,
        returnUrl: `${process.env.FRONTEND_URL}/services/orders/${servicePurchase.id}`,
      });

      await db.orm.public.Payment.create({
        purchaseId: null,
        orderItemId: serviceOrderItem.orderItemId,
        provider: "YUKASSA",
        providerPaymentId: created.providerPaymentId,
        amount: servicePurchase.finalPrice,
        currency: "RUB",
        status: "PENDING",
      });

      res.json({
        paymentUrl: created.redirectUrl,
        paymentId: created.providerPaymentId,
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

    if (provider) {
      // TASK A-011: the provider amount must equal the order FINAL total
      // (after discounts) — never the pre-discount snapshot.
      const created = await provider.createPayment({
        amount: { value: purchase.finalPrice, currency: "RUB" },
        description: `Покупка ресурса: ${resource.title}`,
        orderId: purchase.id.toString(),
        returnUrl: `${process.env.FRONTEND_URL}/purchases/${purchase.id}`,
      });

      await db.orm.public.Payment.create({
        purchaseId: purchase.id,
        provider: "YUKASSA",
        providerPaymentId: created.providerPaymentId,
        amount: purchase.finalPrice,
        currency: "RUB",
        status: "PENDING",
      });

      res.json({
        paymentUrl: created.redirectUrl,
        paymentId: created.providerPaymentId,
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
// Transport authenticity (IP allowlist + HTTP Basic auth) is delegated to the
// provider implementation (E-006); business verification re-fetches the
// payment from the provider API (A-010/A-011). The event is persisted before
// any business effect (E-004/E-005); repeated deliveries are safe.
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    // TASK A-010: when the provider is not configured there is no way to
    // verify transport authenticity or re-fetch provider state — the endpoint
    // must be DISABLED, not open.
    const provider = yooKassaProvider();
    if (!provider) {
      res.status(503).json({ error: "Payment provider is not configured" });
      return;
    }

    // Transport verification: IP allowlist + Basic auth (E-006).
    const clientIP = getClientIP(req);
    const verification = provider.verifyWebhook({ req, body: req.body, sourceIp: clientIP });
    if (!verification.ok) {
      if (verification.reason === "ip") {
        reqLog(req).warn("webhook_rejected_ip_not_whitelisted", { client_ip: clientIP });
        res.status(403).json({ error: "Forbidden: Invalid source IP" });
      } else {
        reqLog(req).warn("webhook_rejected_invalid_auth", { client_ip: clientIP });
        res.status(401).json({ error: "Unauthorized: Invalid credentials" });
      }
      return;
    }

    const webhook = req.body as YooKassaWebhook;

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
    const providerPayment = await provider.getPayment(object.id);
    const expectedEntity = purchase ?? servicePurchase!;
    if (providerPayment.state !== "SUCCEEDED" || providerPayment.paid !== true) {
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "FAILED",
        lastError: "Provider payment is not succeeded",
      });
      res.status(409).json({ error: "Provider payment is not succeeded" });
      return;
    }
    if (
      providerPayment.amount.value !== expectedEntity.finalPrice ||
      providerPayment.amount.currency !== "RUB"
    ) {
      // TASK A-011: amount/currency mismatch -> quarantine, no entitlement.
      await db.orm.public.PaymentProviderEvent.where({ id: eventRecord.id }).update({
        status: "FAILED",
        lastError: `Amount mismatch: provider ${providerPayment.amount.value} ${providerPayment.amount.currency}, expected ${expectedEntity.finalPrice} RUB`,
      });
      reqLog(req).error("payment_quarantined_amount_mismatch", {
        provider_payment_id: object.id,
        provider_amount: providerPayment.amount.value,
        provider_currency: providerPayment.amount.currency,
        expected_amount: expectedEntity.finalPrice,
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

    // E-003: provider confirmed capture -> SUCCEEDED (before settlement).
    if (existingPayment) {
      await transitionPaymentTo(object.id, "SUCCEEDED");
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
          succeededAt: new Date().toISOString(),
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
          succeededAt: new Date().toISOString(),
        });
      }

      // E-003: entitlement granted + ledger settled -> SETTLED.
      await transitionPaymentTo(object.id, "SETTLED");

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
          succeededAt: new Date().toISOString(),
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
          succeededAt: new Date().toISOString(),
        });
      }

      await transitionPaymentTo(object.id, "SETTLED");
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

// POST /payments/refunds - create a refund (ADMIN only, E-008)
// INV-013: the refunded total can never exceed the captured amount.
router.post(
  "/refunds",
  authenticate,
  requireRole("ADMIN"),
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const { paymentId, amount, reason } = req.body ?? {};
      if (!paymentId) {
        res.status(400).json({ error: "Missing paymentId" });
        return;
      }
      const result = await createRefund({
        actorId: req.user!.userId,
        paymentId,
        amount: amount ?? undefined,
        reason,
      });
      reqLog(req).info("refund_created", {
        refund_id: result.refundId,
        payment_id: paymentId,
        amount: result.amount,
        actor_id: req.user!.userId,
      });
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof PaymentRefundError) {
        reqLog(req).warn("refund_rejected", { code: error.code, status: error.status });
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      reqLog(req).error("refund_create_failed", { error });
      res.status(500).json({ error: "Failed to create refund" });
    }
  }
);

// GET /payments/:paymentId/refunds - list refunds for a payment (ADMIN only)
router.get(
  "/:paymentId/refunds",
  authenticate,
  requireRole("ADMIN"),
  validateCuid("paymentId"),
  standardRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const refunds = await db.orm.public.Refund.where({ paymentId: req.params.paymentId as string })
        .orderBy((m) => m.createdAt.desc())
        .all();
      res.json({ data: refunds, total: refunds.length });
    } catch (error) {
      reqLog(req).error("refunds_fetch_failed", { error });
      res.status(500).json({ error: "Failed to fetch refunds" });
    }
  }
);

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
        if (yooKassaProvider()) {
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
