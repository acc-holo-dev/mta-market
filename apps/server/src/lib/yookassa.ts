// YooKassa payment integration
import crypto from "crypto";

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || "";
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || "";
const YOOKASSA_WEBHOOK_SECRET = process.env.YOOKASSA_WEBHOOK_SECRET || "";
const YOOKASSA_ENABLED = process.env.YOOKASSA_ENABLED === "true";

export interface CreatePaymentOptions {
  amount: number; // kopecks
  currency?: string;
  description: string;
  orderId: string;
  returnUrl: string;
}

export interface YooKassaPayment {
  id: string;
  status: string;
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  confirmation: {
    type: string;
    confirmation_url: string;
  };
  created_at: string;
  description: string;
  metadata: {
    order_id: string;
  };
}

export interface YooKassaWebhook {
  type: string;
  event: string;
  object: {
    id: string;
    status: string;
    paid: boolean;
    amount: {
      value: string;
      currency: string;
    };
    metadata: {
      order_id: string;
    };
  };
}

// Create payment in YooKassa
export async function createYooKassaPayment(
  options: CreatePaymentOptions
): Promise<YooKassaPayment> {
  if (!YOOKASSA_ENABLED) {
    throw new Error("YooKassa is not enabled");
  }

  const { amount, currency = "RUB", description, orderId, returnUrl } = options;

  const idempotenceKey = crypto.randomUUID();
  const authHeader = Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString("base64");

  const response = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
      Authorization: `Basic ${authHeader}`,
    },
    body: JSON.stringify({
      amount: {
        value: (amount / 100).toFixed(2),
        currency,
      },
      confirmation: {
        type: "redirect",
        return_url: returnUrl,
      },
      capture: true,
      description,
      metadata: {
        order_id: orderId,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YooKassa API error: ${error}`);
  }

  return (await response.json()) as YooKassaPayment;
}

// Verify webhook signature
export function verifyYooKassaWebhook(body: string, signature: string): boolean {
  if (!YOOKASSA_ENABLED) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", YOOKASSA_WEBHOOK_SECRET);
  hmac.update(body);
  const expectedSignature = hmac.digest("hex");

  return signature === expectedSignature;
}

// Get payment status
export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  if (!YOOKASSA_ENABLED) {
    throw new Error("YooKassa is not enabled");
  }

  const authHeader = Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString("base64");

  const response = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${authHeader}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YooKassa API error: ${error}`);
  }

  return (await response.json()) as YooKassaPayment;
}

export { YOOKASSA_ENABLED };
