// Order service - manage shopping cart and order lifecycle
import { db } from "../prisma/db";
import { validateDiscount, calculateFinalPrice } from "./discount";

export interface AddToCartRequest {
  userId: string;
  resourceId: string;
  discountCode?: string;
}

export interface AddToCartResult {
  orderId: string;
  orderItemId: string;
  itemCount: number;
}

/**
 * Get or create active cart for user
 */
export async function getOrCreateCart(userId: string): Promise<any> {
  // Find existing cart
  let cart = await db.orm.public.Order.where({
    buyerId: userId,
    status: "CART",
  }).first();

  if (!cart) {
    // Create new cart
    cart = await db.orm.public.Order.create({
      buyerId: userId,
      status: "CART",
      totalAmount: 0,
      platformFee: 0,
    });
  }

  return cart;
}

/**
 * Add resource to cart
 */
export async function addToCart(request: AddToCartRequest): Promise<AddToCartResult> {
  const { userId, resourceId, discountCode } = request;

  // Get or create cart
  const cart = await getOrCreateCart(userId);

  // Check if resource already in cart
  const existingItem = await db.orm.public.OrderItem.where({
    orderId: cart.id,
    resourceId,
  }).first();

  if (existingItem) {
    throw new Error("Resource already in cart");
  }

  // Get resource
  const resource = await db.orm.public.Resource.where({ id: resourceId }).first();

  if (!resource) {
    throw new Error("Resource not found");
  }

  if (resource.status !== "PUBLISHED") {
    throw new Error("Resource not available");
  }

  // Get latest version
  const versions = await db.orm.public.ResourceVersion.where({ resourceId })
    .orderBy((m) => m.publishedAt.desc())
    .limit(1)
    .all();

  const version = versions[0];

  if (!version) {
    throw new Error("No versions available");
  }

  // Snapshot price
  const priceSnapshot = resource.price;

  // Apply discount
  let discountId: string | undefined;
  let discountSnapshot = 0;

  if (discountCode && priceSnapshot > 0) {
    const validation = await validateDiscount({
      code: discountCode,
      resourceId,
      originalPrice: priceSnapshot,
    });

    if (validation.valid && validation.discount) {
      discountId = validation.discount.id;
      discountSnapshot = validation.discount.discountAmount;
    }
  }

  // Calculate final price
  const finalPrice = calculateFinalPrice(priceSnapshot, discountSnapshot);

  // Create order item
  const orderItem = await db.orm.public.OrderItem.create({
    orderId: cart.id,
    resourceId,
    versionId: version.id,
    quantity: 1,
    priceSnapshot,
    discountId,
    discountSnapshot,
    finalPrice,
  });

  // Recalculate order total
  await recalculateOrderTotal(cart.id);

  // Get item count
  const items = await db.orm.public.OrderItem.where({ orderId: cart.id }).all();

  return {
    orderId: cart.id,
    orderItemId: orderItem.id,
    itemCount: items.length,
  };
}

/**
 * Remove item from cart
 */
export async function removeFromCart(userId: string, orderItemId: string): Promise<void> {
  const cart = await getOrCreateCart(userId);

  const item = await db.orm.public.OrderItem.where({
    id: orderItemId,
    orderId: cart.id,
  }).first();

  if (!item) {
    throw new Error("Item not found in cart");
  }

  await db.orm.public.OrderItem.where({ id: orderItemId }).delete();

  await recalculateOrderTotal(cart.id);
}

/**
 * Recalculate order total
 */
export async function recalculateOrderTotal(orderId: string): Promise<void> {
  const items = await db.orm.public.OrderItem.where({ orderId }).all();

  const totalAmount = items.reduce((sum, item) => sum + item.finalPrice, 0);
  const platformFee = Math.round(totalAmount * 0.1);

  await db.orm.public.Order.where({ id: orderId }).update({
    totalAmount,
    platformFee,
  });
}

/**
 * Submit order for payment (cart → pending)
 */
export async function submitOrder(userId: string, orderId: string): Promise<any> {
  const order = await db.orm.public.Order.where({
    id: orderId,
    buyerId: userId,
    status: "CART",
  }).first();

  if (!order) {
    throw new Error("Cart not found");
  }

  const items = await db.orm.public.OrderItem.where({ orderId }).all();

  if (items.length === 0) {
    throw new Error("Cart is empty");
  }

  // Update order status
  await db.orm.public.Order.where({ id: orderId }).update({
    status: "PENDING",
    submittedAt: new Date().toISOString(),
  });

  return order;
}

/**
 * Complete order after payment (create purchases + licenses)
 */
export async function completeOrder(orderId: string): Promise<void> {
  const order = await db.orm.public.Order.where({ id: orderId }).first();

  if (!order) {
    throw new Error("Order not found");
  }

  const items = await db.orm.public.OrderItem.where({ orderId }).all();

  // Create purchases for each item
  for (const item of items) {
    const platformFee = Math.round(item.finalPrice * 0.1);
    const sellerRevenue = item.finalPrice - platformFee;

    const purchase = await db.orm.public.Purchase.create({
      orderItemId: item.id,
      buyerId: order.buyerId,
      resourceId: item.resourceId,
      versionId: item.versionId,
      status: "COMPLETED",
      priceSnapshot: item.priceSnapshot,
      discountSnapshot: item.discountSnapshot,
      finalPrice: item.finalPrice,
      platformFee,
      sellerRevenue,
      completedAt: new Date().toISOString(),
    });

    // Create license
    await db.orm.public.License.create({
      purchaseId: purchase.id,
      versionId: item.versionId,
      status: "ACTIVE",
    });

    // Increment discount usage if applied
    if (item.discountId) {
      await db.orm.public.Discount.where({ id: item.discountId }).update({
        usageCount: { increment: 1 },
      });
    }
  }

  // Mark order as completed
  await db.orm.public.Order.where({ id: orderId }).update({
    status: "COMPLETED",
    completedAt: new Date().toISOString(),
  });
}

/**
 * Get cart items
 */
export async function getCartItems(userId: string): Promise<any[]> {
  const cart = await getOrCreateCart(userId);

  const items = await db.orm.public.OrderItem.where({ orderId: cart.id }).all();

  // Populate resource details
  const populated = await Promise.all(
    items.map(async (item) => {
      const resource = await db.orm.public.Resource.where({ id: item.resourceId }).first();
      return {
        ...item,
        resource,
      };
    })
  );

  return populated;
}
