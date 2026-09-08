// Discount pricing helpers.
// PLAN.md Phase C (C-004..C-008) will introduce the DiscountCampaign model and
// backend-only discount calculation. Until that contract exists, discount
// validation explicitly reports "not available" instead of silently ignoring
// codes, and price math stays pure (frontend price is never trusted).
// NOTE: this module intentionally performs NO database access.

export interface DiscountValidationResult {
  valid: boolean;
  error?: string;
  discount?: {
    id: string;
    name: string;
    type: "PERCENTAGE" | "FIXED";
    value: number;
    discountAmount: number; // Calculated discount in kopecks
  };
}

export interface ApplyDiscountRequest {
  code?: string; // Promo code
  discountId?: string; // Direct discount ID
  resourceId: string;
  originalPrice: number; // Kopecks
}

/**
 * Validate and calculate a discount.
 * Phase C bridge: no DiscountCampaign model exists in the contract yet,
 * so every code is rejected with an explicit reason.
 */
export async function validateDiscount(
  _request: ApplyDiscountRequest
): Promise<DiscountValidationResult> {
  return {
    valid: false,
    error: "Discount campaigns are not available yet",
  };
}

/**
 * Apply discount and increment usage count.
 * Phase C bridge: no-op until the DiscountCampaign model exists (C-007
 * defines the atomicity requirements for the real implementation).
 */
export async function applyDiscount(_discountId: string): Promise<void> {
  // Intentionally empty: nothing to increment without the model.
}

/**
 * Calculate final price after discount. Pure function.
 */
export function calculateFinalPrice(originalPrice: number, discountAmount: number): number {
  const finalPrice = originalPrice - discountAmount;
  return Math.max(0, finalPrice); // Cannot be negative
}

/**
 * Check if user can create discount (admin or resource seller).
 * Pure policy helper retained for Phase C.
 */
export function canCreateDiscount(userId: string, sellerId: string, isAdmin: boolean): boolean {
  return isAdmin || userId === sellerId;
}