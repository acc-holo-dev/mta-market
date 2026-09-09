// Temporary: check groupBy row shape with data present.
import { db } from "../src/prisma/db";

const P = "550e8400-e29b-41d4-a716-44665544990";

async function main() {
  const anyUser = db.orm.public.User as any;
  await anyUser
    .where({ id: P })
    .delete()
    .catch(() => undefined);
  await db.orm.public.User.create({
    id: P,
    email: "groupby-probe@example.local",
    username: "groupby_probe",
    role: "USER",
    status: "ACTIVE",
  });
  await db.orm.public.User.create({
    email: "groupby-probe2@example.local",
    username: "groupby_probe2",
    role: "USER",
    status: "BANNED",
  });

  const rows = await anyUser.groupBy(["status"]).aggregate((agg: any) => ({ n: agg.count() }));
  console.log("groupBy rows:", JSON.stringify(rows, null, 1).slice(0, 800));

  // aggregate with avg over Review.rating
  const reviewAgg = await (db.orm.public.Review as any).aggregate((agg: any) => ({
    total: agg.count(),
    averageRating: agg.avg("rating"),
  }));
  console.log("review aggregate:", JSON.stringify(reviewAgg));

  // cleanup
  await anyUser.where({ email: { contains: "groupby-probe" } }).delete().catch(() => undefined);
  const all = await anyUser.where({}).all();
  for (const u of all) {
    if (String(u.email).includes("groupby-probe")) {
      await anyUser.where({ id: u.id }).delete().catch(() => undefined);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
