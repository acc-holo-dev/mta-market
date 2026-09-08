// Shared test-DB reset: removes all entities belonging to the fixed test
// user ID range (550e8400-e29b-41d4-a716-44665544xx) in FK-safe order.
// Robust across failed runs — every step is independent and idempotent.
import { db } from "../../src/prisma/db";

const TEST_ID_PREFIX = "550e8400-e29b-41d4-a716-44665544";

export async function resetTestEntities(): Promise<void> {
  const allUsers = await db.orm.public.User.where({}).all();
  const testUserIds = new Set(
    allUsers.filter((u) => u.id.startsWith(TEST_ID_PREFIX)).map((u) => u.id)
  );

  // 1. Purchases (cascade: license -> installation -> lease)
  try {
    const purchases = await db.orm.public.Purchase.where({}).all();
    for (const p of purchases) {
      if (testUserIds.has(p.buyerId)) {
        await db.orm.public.Purchase.where({ id: p.id }).delete().catch(() => undefined);
      }
    }
  } catch (e) {
    console.warn("[reset] purchases:", e instanceof Error ? e.message : e);
  }

  // 2. Resources by test sellers (cascade: versions -> signatures/sandbox runs)
  try {
    const resources = await db.orm.public.Resource.where({}).all();
    for (const r of resources) {
      if (testUserIds.has(r.sellerId)) {
        await db.orm.public.Resource.where({ id: r.id }).delete().catch(() => undefined);
      }
    }
  } catch (e) {
    console.warn("[reset] resources:", e instanceof Error ? e.message : e);
  }

  // 3. Publisher keys (FK restrict on user deletion)
  try {
    const keys = await db.orm.public.PublisherKey.where({}).all();
    for (const k of keys) {
      if (testUserIds.has(k.sellerId)) {
        await db.orm.public.PublisherKey.where({ id: k.id }).delete().catch(() => undefined);
      }
    }
  } catch (e) {
    console.warn("[reset] publisher keys:", e instanceof Error ? e.message : e);
  }

  // 4. Financial transactions + balances (FK restrict on user deletion)
  try {
    const tx = await db.orm.public.FinancialTransaction.where({}).all();
    for (const t of tx) {
      if (testUserIds.has(t.userId)) {
        await db.orm.public.FinancialTransaction.where({ id: t.id }).delete().catch(() => undefined);
      }
    }
  } catch (e) {
    console.warn("[reset] transactions:", e instanceof Error ? e.message : e);
  }
  try {
    const balances = await db.orm.public.SellerBalance.where({}).all();
    for (const b of balances) {
      if (testUserIds.has(b.userId)) {
        await db.orm.public.SellerBalance.where({ userId: b.userId }).delete().catch(() => undefined);
      }
    }
  } catch (e) {
    console.warn("[reset] balances:", e instanceof Error ? e.message : e);
  }

  // 5. Payment provider events of the test range
  try {
    const events = await db.orm.public.PaymentProviderEvent.where({ provider: "YUKASSA" }).all();
    for (const ev of events) {
      // Test events reference test purchases which are already gone
      const stillThere = await db.orm.public.Purchase.where({ id: ev.objectId }).first().catch(() => null);
      if (!stillThere) {
        await db.orm.public.PaymentProviderEvent.where({ id: ev.id }).delete().catch(() => undefined);
      }
    }
  } catch (e) {
    console.warn("[reset] provider events:", e instanceof Error ? e.message : e);
  }

  // 6. Users last (sessions/accounts/reviews cascade)
  for (const uid of testUserIds) {
    await db.orm.public.User.where({ id: uid }).delete().catch(() => undefined);
  }
}

/** Create a test user and return an access token for it. */
export async function createTestUser(
  id: string,
  username: string,
  role: "USER" | "ADMIN" | "MODERATOR",
  tokenFactory: (p: { userId: string; email: string; role: string }) => string
): Promise<string> {
  const email = `${username}@test.local`;
  await db.orm.public.User.where({ id }).delete().catch(() => undefined);
  await db.orm.public.User.create({
    id,
    email,
    username,
    role,
    status: "ACTIVE",
  });
  return tokenFactory({ userId: id, email, role });
}