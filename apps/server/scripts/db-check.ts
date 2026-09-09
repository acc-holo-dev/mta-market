// Temporary: probe updateAndCount predicate semantics (C-007 CAS design).
import { db } from "../src/prisma/db";

const SELLER = "550e8400-e29b-41d4-a716-446655449902";

async function main() {
  const anyDb = db as any;
  await anyDb.orm.public.DiscountCampaign.where({ sellerId: SELLER }).deleteAll();
  await anyDb.orm.public.User.where({ id: SELLER }).delete().catch(() => undefined);
  await db.orm.public.User.create({
    id: SELLER, email: "cas-probe@example.local", username: "cas_probe", role: "USER", status: "ACTIVE",
  });

  const camp = await db.orm.public.DiscountCampaign.create({
    sellerId: SELLER,
    name: "cas-probe",
    type: "PERCENT",
    value: 10,
    isActive: true,
    usedCount: 5,
  });

  // 1. matching predicate (id + usedCount=5)
  const r1 = await db.orm.public.DiscountCampaign
    .where({ id: camp.id, usedCount: 5 })
    .updateAndCount({ usedCount: 6 });
  console.log("match:", JSON.stringify(r1)?.slice(0, 150));

  // 2. non-matching predicate (usedCount=999)
  const r2 = await db.orm.public.DiscountCampaign
    .where({ id: camp.id, usedCount: 999 })
    .updateAndCount({ usedCount: 7 });
  console.log("no-match:", JSON.stringify(r2)?.slice(0, 150));

  // 3. concurrent updateAndCount CAS: 10 workers, limit 3
  await db.orm.public.DiscountCampaign.where({ id: camp.id }).update({ usedCount: 0 });
  let wins = 0;
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      anyDb.transaction(async (tx: any) => {
        const row = await tx.orm.public.DiscountCampaign.where({ id: camp.id }).first();
        const used = Number(row.usedCount);
        if (used >= 3) return "limit";
        const cas = await tx.orm.public.DiscountCampaign
          .where({ id: camp.id, usedCount: used })
          .updateAndCount({ usedCount: used + 1 });
        const affected = typeof cas === "object" && cas !== null ? Number(cas.affectedCount ?? cas.count ?? cas) : Number(cas);
        if (affected === 1) return "win";
        return "lost";
      }).catch((e: unknown) => `err:${e instanceof Error ? e.message.slice(0, 40) : e}`)
    )
  );
  wins = results.filter((r) => r === "win").length;
  const final = await db.orm.public.DiscountCampaign.where({ id: camp.id }).first();
  console.log("concurrent results:", JSON.stringify(results), "wins:", wins, "final usedCount:", final?.usedCount);

  await anyDb.orm.public.DiscountCampaign.where({ sellerId: SELLER }).deleteAll();
  await anyDb.orm.public.User.where({ id: SELLER }).delete().catch(() => undefined);
  process.exit(0);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
