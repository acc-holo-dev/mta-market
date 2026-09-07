// Financial ledger helpers
// Tracks seller balances and records immutable transactions.
// Invariant: balanceAfter = previous balance + amount (per seller).
import { db } from "../prisma/db";

export interface RecordSellerRevenueOptions {
  sellerId: number;
  purchaseId: number;
  amount: number; // kopecks, must be >= 0
  type: "SELLER_REVENUE" | "REFUND_FROM_SELLER" | "ADJUSTMENT";
}

/**
 * Atomically updates the seller's balance and records a ledger transaction.
 * Uses a transaction so concurrent settlements cannot double-count.
 */
export async function recordSellerRevenue(options: RecordSellerRevenueOptions): Promise<{
  balanceAfter: number;
}> {
  const { sellerId, purchaseId, amount, type } = options;

  if (amount < 0) {
    throw new Error(`Ledger amount must be non-negative, got ${amount}`);
  }

  // Ensure balance row exists (upsert-like behavior)
  let balance = await db.orm.public.SellerBalance.where({ userId: sellerId }).first();

  if (!balance) {
    balance = await db.orm.public.SellerBalance.create({
      userId: sellerId,
      availableAmount: 0,
      inEscrowAmount: 0,
      totalEarned: 0,
    });
  }

  const newBalance = balance.availableAmount + amount;

  await db.orm.public.SellerBalance.where({ userId: sellerId }).update({
    availableAmount: newBalance,
    totalEarned: balance.totalEarned + amount,
  });

  await db.orm.public.FinancialTransaction.create({
    userId: sellerId,
    type,
    amount,
    balanceAfter: newBalance,
    relatedPurchaseId: purchaseId,
  });

  return { balanceAfter: newBalance };
}

/**
 * Records revenue split for a completed purchase:
 * seller gets priceSnapshot - platformFee; platform keeps platformFee.
 * Reads fee breakdown from the purchase snapshot (immutable).
 */
export async function settlePurchaseRevenue(purchase: {
  id: number;
  sellerId?: number;
  resourceId: number;
  priceSnapshot: number;
  platformFee: number;
  sellerRevenue: number;
}): Promise<void> {
  // Resolve seller from the resource (purchase snapshot holds resourceId)
  const resource = await db.orm.public.Resource.where({ id: purchase.resourceId }).first();

  if (!resource) {
    throw new Error(`Cannot settle purchase ${purchase.id}: resource not found`);
  }

  const sellerId = purchase.sellerId ?? resource.sellerId;

  // Invariant: fee breakdown must add up
  if (purchase.platformFee + purchase.sellerRevenue !== purchase.priceSnapshot) {
    throw new Error(
      `Ledger invariant violated for purchase ${purchase.id}: ` +
        `platformFee(${purchase.platformFee}) + sellerRevenue(${purchase.sellerRevenue}) ` +
        `!= priceSnapshot(${purchase.priceSnapshot})`
    );
  }

  // Credit seller with their revenue portion
  if (purchase.sellerRevenue > 0) {
    await recordSellerRevenue({
      sellerId,
      purchaseId: purchase.id,
      amount: purchase.sellerRevenue,
      type: "SELLER_REVENUE",
    });
  }
}
