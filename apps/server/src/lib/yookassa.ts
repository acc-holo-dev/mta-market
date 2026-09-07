// YooKassa payment integration
// Auth uses HTTP Basic (shopId:secretKey) per official docs.
// Webhook authenticity is established by re-verifying payment state via the
// provider API rather than by trusting webhook headers.
import crypto from "crypto";

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || "";
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || "";
const YOOKASSA_ENABLED = process.env.YOOKASSA_ENABLED === "true";

if (YOOKASSA_ENABLED && (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY)) {
  throw new Error(
    "FATAL: YOOKASSA_ENABLED=true but YOOKASSA_SHOP_ID or YOOKASSA_SECRET_KEY is missing"
  );
}

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

// Get current payment state directly from YooKassa.
// Used to verify webhook notifications before granting entitlements.
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
