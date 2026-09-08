// Temporary: verify aggregate() with builder callback shape.
import { db } from "../src/prisma/db";

async function main() {
  const anyUser = db.orm.public.User as any;

  try {
    const r = await anyUser.aggregate((agg: any) => ({ total: agg.count() }));
    console.log("aggregate(agg=>{total:agg.count()}):", JSON.stringify(r));
  } catch (e) {
    console.log("aggregate builder failed:", e instanceof Error ? e.message : e);
  }

  try {
    const r = await anyUser
      .where({ status: "ACTIVE" })
      .aggregate((agg: any) => ({ total: agg.count() }));
    console.log("where+aggregate:", JSON.stringify(r));
  } catch (e) {
    console.log("where+aggregate failed:", e instanceof Error ? e.message : e);
  }

  try {
    const r = await anyUser
      .groupBy(["status"])
      .aggregate((agg: any) => ({ n: agg.count() }));
    console.log("groupBy+aggregate:", JSON.stringify(r).slice(0, 300));
  } catch (e) {
    console.log("groupBy+aggregate failed:", e instanceof Error ? e.message : e);
  }
  process.exit(0);
}

main();