// Discount service - apply and validate discount campaigns
import { db } from "../prisma/db";

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
 * Validate and calculate discount
 */
export async function validateDiscount(
  request: ApplyDiscountRequest
): Promise<DiscountValidationResult> {
  let discount;

  // Find discount by code or ID
  if (request.code) {
    discount = await db.orm.public.Discount.where({ code: request.code }).first();
  } else if (request.discountId) {
    discount = await db.orm.public.Discount.where({ id: request.discountId }).first();
  } else {
    return { valid: false, error: "No discount code or ID provided" };
  }

  if (!discount) {
    return { valid: false, error: "Invalid discount code" };
  }

  // Check if discount has started
  const now = new Date();
  const startsAt = new Date(discount.startsAt);
  if (now < startsAt) {
    return { valid: false, error: "Discount not yet active" };
  }

  // Check if discount has expired
  if (discount.expiresAt) {
    const expiresAt = new Date(discount.expiresAt);
    if (now > expiresAt) {
      return { valid: false, error: "Discount has expired" };
    }
  }

  // Check usage limit
  if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
    return { valid: false, error: "Discount usage limit reached" };
  }

  // Check if discount applies to this resource
  if (discount.resourceId && discount.resourceId !== request.resourceId) {
    return { valid: false, error: "Discount does not apply to this resource" };
  }

  // Check minimum purchase amount
  if (discount.minPurchase && request.originalPrice < discount.minPurchase) {
    return {
      valid: false,
      error: `Minimum purchase amount: ${(discount.minPurchase / 100).toFixed(2)} RUB`,
    };
  }

  // Calculate discount amount
  let discountAmount = 0;

  if (discount.type === "PERCENTAGE") {
    discountAmount = Math.round((request.originalPrice * discount.value) / 100);
  } else if (discount.type === "FIXED") {
    discountAmount = discount.value;
  }

  // Apply maximum discount cap
  if (discount.maxDiscount && discountAmount > discount.maxDiscount) {
    discountAmount = discount.maxDiscount;
  }

  // Discount cannot exceed original price
  if (discountAmount > request.originalPrice) {
    discountAmount = request.originalPrice;
  }

  // Discount cannot make price negative
  if (discountAmount < 0) {
    discountAmount = 0;
  }

  return {
    valid: true,
    discount: {
      id: discount.id,
      name: discount.name,
      type: discount.type as "PERCENTAGE" | "FIXED",
      value: discount.value,
      discountAmount,
    },
  };
}

/**
 * Apply discount and increment usage count
 */
export async function applyDiscount(discountId: string): Promise<void> {
  await db.orm.public.Discount.where({ id: discountId }).update({
    usageCount: { increment: 1 },
  });
}

/**
 * Calculate final price after discount
 */
export function calculateFinalPrice(originalPrice: number, discountAmount: number): number {
  const finalPrice = originalPrice - discountAmount;
  return Math.max(0, finalPrice); // Cannot be negative
}

/**
 * Get active discounts for a resource
 */
export async function getActiveDiscounts(resourceId?: string): Promise<any[]> {
  const now = new Date().toISOString();

  const query: any = {
    startsAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
  };

  if (resourceId) {
    query.OR = [{ resourceId }, { resourceId: null }]; // Resource-specific or platform-wide
  }

  return await db.orm.public.Discount.where(query).all();
}

/**
 * Check if user can create discount (admin or resource seller)
 */
export function canCreateDiscount(userId: string, sellerId: string, isAdmin: boolean): boolean {
  return isAdmin || userId === sellerId;
}
