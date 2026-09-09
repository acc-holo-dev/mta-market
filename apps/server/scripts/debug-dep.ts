// Temporary: debug dependency validation against live data.
import { db } from "../src/prisma/db";
import { validateResourceDependencies } from "../src/lib/artifact/dependencies";

(async () => {
  const slug = "dbg-dep-" + Date.now().toString(36);
  const seller = "550e8400-e29b-41d4-a716-446655446801";
  await db.orm.public.User.where({ id: seller }).delete().catch(() => undefined);
  await db.orm.public.User.create({ id: seller, email: "dbgdep@s.local", username: "dbgdep" + Date.now(), role: "USER", status: "ACTIVE" });
  const resource = await db.orm.public.Resource.create({
    sellerId: seller,
    slug,
    title: "DBG dep",
    description: "dep debug fixture",
    type: "SCRIPT",
    status: "DRAFT",
    price: 100,
  });
  await db.orm.public.ResourceDependency.create({
    resourceId: resource.id,
    dependsOnSlug: slug, // self-dependency
  });

  const result = await validateResourceDependencies(slug);
  console.log("by slug:", JSON.stringify(result).slice(0, 300));

  const result2 = await validateResourceDependencies(resource.id);
  console.log("by id (wrong arg):", JSON.stringify(result2).slice(0, 200));

  process.exit(0);
})();
