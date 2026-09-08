// YooKassa Payment Provider Implementation
import crypto from "crypto";
import {
  IPaymentProvider,
  CreatePaymentRequest,
  PaymentResponse,
  PaymentDetails,
  PaymentStatus,
  WebhookEvent,
} from "./paymentProvider";
import { isYooKassaIP } from "./yookassaWebhook";

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || "";
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || "";
const YOOKASSA_NOTIFICATION_PASSWORD = process.env.YOOKASSA_NOTIFICATION_PASSWORD || "";
const YOOKASSA_ENABLED = process.env.YOOKASSA_ENABLED === "true";

// YooKassa-specific types (kept for internal mapping)
interface YooKassaPaymentResponse {
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

interface YooKassaWebhookPayload {
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

/**
 * YooKassa Payment Provider
 * Russian payment gateway
 */
export class YooKassaProvider implements IPaymentProvider {
  readonly name = "yookassa";

  isEnabled(): boolean {
    return YOOKASSA_ENABLED && !!YOOKASSA_SHOP_ID && !!YOOKASSA_SECRET_KEY;
  }

  async createPayment(request: CreatePaymentRequest): Promise<PaymentResponse> {
    if (!this.isEnabled()) {
      throw new Error("YooKassa is not enabled or not configured");
    }

    const idempotenceKey = crypto.randomUUID();
    const authHeader = Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString("base64");

    const body = {
      amount: {
        value: (request.amount.value / 100).toFixed(2), // Convert kopecks to rubles
        currency: request.amount.currency,
      },
      confirmation: {
        type: "redirect",
        return_url: request.returnUrl,
      },
      capture: true,
      description: request.description,
      metadata: {
        order_id: request.orderId,
        ...request.metadata,
      },
    };

    const response = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": idempotenceKey,
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`YooKassa API error: ${error}`);
    }

    const data = (await response.json()) as YooKassaPaymentResponse;

    return {
      providerId: data.id,
      status: this.mapStatus(data.status),
      redirectUrl: data.confirmation.confirmation_url,
      createdAt: data.created_at,
      metadata: data,
    };
  }

  async getPayment(providerId: string): Promise<PaymentDetails> {
    if (!this.isEnabled()) {
      throw new Error("YooKassa is not enabled");
    }

    const authHeader = Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString("base64");

    const response = await fetch(`https://api.yookassa.ru/v3/payments/${providerId}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`YooKassa API error: ${error}`);
    }

    const data = (await response.json()) as YooKassaPaymentResponse;

    return {
      providerId: data.id,
      status: this.mapStatus(data.status),
      paid: data.paid,
      amount: {
        value: Math.round(parseFloat(data.amount.value) * 100), // Rubles to kopecks
        currency: data.amount.currency,
      },
      createdAt: data.created_at,
      metadata: data,
    };
  }

  parseWebhook(rawPayload: any, headers: Record<string, string>): WebhookEvent | null {
    try {
      const payload = rawPayload as YooKassaWebhookPayload;

      if (!payload?.event || !payload?.object?.id) {
        return null;
      }

      return {
        type: payload.event,
        providerId: payload.object.id,
        status: this.mapStatus(payload.object.status),
        data: payload,
      };
    } catch (error) {
      console.error("Failed to parse YooKassa webhook:", error);
      return null;
    }
  }

  verifyWebhook(event: WebhookEvent, headers: Record<string, string>, sourceIp: string): boolean {
    // Verify IP whitelist
    if (!isYooKassaIP(sourceIp)) {
      console.warn(`YooKassa webhook rejected: IP ${sourceIp} not in whitelist`);
      return false;
    }

    // Verify Basic Auth
    const authHeader = headers["authorization"] || headers["Authorization"];
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      console.warn("YooKassa webhook rejected: Missing Basic Auth");
      return false;
    }

    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
    const [shopId, password] = credentials.split(":");

    if (shopId !== YOOKASSA_SHOP_ID || password !== YOOKASSA_NOTIFICATION_PASSWORD) {
      console.warn("YooKassa webhook rejected: Invalid credentials");
      return false;
    }

    return true;
  }

  /**
   * Map YooKassa status to generic PaymentStatus
   */
  private mapStatus(yookassaStatus: string): PaymentStatus {
    switch (yookassaStatus) {
      case "pending":
        return PaymentStatus.PENDING;
      case "waiting_for_capture":
        return PaymentStatus.PROCESSING;
      case "succeeded":
        return PaymentStatus.SUCCEEDED;
      case "canceled":
        return PaymentStatus.CANCELLED;
      default:
        return PaymentStatus.FAILED;
    }
  }
}

// Register YooKassa provider
import { paymentProviders } from "./paymentProvider";
paymentProviders.register(new YooKassaProvider());

// Export for direct usage (backward compatibility)
export const yooKassaProvider = new YooKassaProvider();
export { YOOKASSA_ENABLED, YOOKASSA_SHOP_ID };

// Legacy exports for backward compatibility
export interface CreatePaymentOptions {
  amount: number; // kopecks
  currency?: string;
  description: string;
  orderId: string;
  returnUrl: string;
}

export async function createYooKassaPayment(options: CreatePaymentOptions) {
  return yooKassaProvider.createPayment({
    amount: { value: options.amount, currency: options.currency || "RUB" },
    description: options.description,
    orderId: options.orderId,
    returnUrl: options.returnUrl,
  });
}

export async function getYooKassaPayment(paymentId: string) {
  return yooKassaProvider.getPayment(paymentId);
}

export type { YooKassaPaymentResponse as YooKassaPayment };
export type { YooKassaWebhookPayload as YooKassaWebhook };
