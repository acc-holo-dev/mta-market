// Payment Provider Interface
// Abstraction layer for payment providers (YooKassa, T-Bank, Alfa-Bank, etc.)

export interface PaymentAmount {
  value: number; // Minor units (kopecks, cents, etc.)
  currency: string; // ISO 4217 (RUB, USD, etc.)
}

export interface CreatePaymentRequest {
  amount: PaymentAmount;
  description: string;
  orderId: string; // Internal order/purchase ID
  returnUrl: string; // Redirect URL after payment
  metadata?: Record<string, string>; // Additional provider-specific data
}

export interface PaymentResponse {
  providerId: string; // Provider's payment ID
  status: PaymentStatus;
  redirectUrl?: string; // URL to redirect user for payment
  createdAt: string; // ISO timestamp
  metadata?: Record<string, any>;
}

export enum PaymentStatus {
  PENDING = "PENDING", // Created, awaiting user action
  PROCESSING = "PROCESSING", // User submitted, processing
  SUCCEEDED = "SUCCEEDED", // Payment successful
  FAILED = "FAILED", // Payment failed
  CANCELLED = "CANCELLED", // Cancelled by user or system
}

export interface PaymentDetails {
  providerId: string;
  status: PaymentStatus;
  paid: boolean;
  amount: PaymentAmount;
  createdAt: string;
  paidAt?: string;
  metadata?: Record<string, any>;
}

export interface WebhookEvent {
  type: string; // Provider-specific event type
  providerId: string; // Provider's payment ID
  status: PaymentStatus;
  data: any; // Raw webhook payload
}

/**
 * Payment Provider Interface
 * 
 * Implementations:
 * - YooKassaProvider (Russia)
 * - TBankProvider (T-Bank, Russia)
 * - AlfaBankProvider (Alfa-Bank, Russia)
 * - StripeProvider (International)
 */
export interface IPaymentProvider {
  /**
   * Provider name for logging and identification
   */
  readonly name: string;

  /**
   * Check if provider is enabled and configured
   */
  isEnabled(): boolean;

  /**
   * Create a new payment
   * 
   * @param request - Payment creation parameters
   * @returns Payment response with redirect URL
   */
  createPayment(request: CreatePaymentRequest): Promise<PaymentResponse>;

  /**
   * Get current payment status from provider API
   * Used to verify webhook notifications
   * 
   * @param providerId - Provider's payment ID
   * @returns Current payment details
   */
  getPayment(providerId: string): Promise<PaymentDetails>;

  /**
   * Parse and validate webhook event
   * 
   * @param rawPayload - Raw webhook request body
   * @param headers - HTTP headers (for signature verification)
   * @returns Parsed webhook event or null if invalid
   */
  parseWebhook(rawPayload: any, headers: Record<string, string>): WebhookEvent | null;

  /**
   * Verify webhook authenticity (signature, IP, etc.)
   * 
   * @param event - Parsed webhook event
   * @param headers - HTTP headers
   * @param sourceIp - Client IP address
   * @returns true if webhook is authentic
   */
  verifyWebhook(event: WebhookEvent, headers: Record<string, string>, sourceIp: string): boolean;
}

/**
 * Payment Provider Registry
 */
export class PaymentProviderRegistry {
  private providers = new Map<string, IPaymentProvider>();

  register(provider: IPaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): IPaymentProvider | undefined {
    return this.providers.get(name);
  }

  getEnabled(): IPaymentProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isEnabled());
  }

  getDefault(): IPaymentProvider | null {
    const enabled = this.getEnabled();
    return enabled.length > 0 ? enabled[0] : null;
  }
}

// Global registry instance
export const paymentProviders = new PaymentProviderRegistry();
