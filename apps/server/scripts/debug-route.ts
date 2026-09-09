// Temporary: debug PATCH /resources/:slug route resolution.
import request from "supertest";
import { createApp } from "../src/app";
import { db } from "../src/prisma/db";
import { generateAccessToken } from "../src/lib/jwt";

(async () => {
  const app = request(createApp());
  const seller = "550e8400-e29b-41d4-a716-446655446801";
  await db.orm.public.User.where({ id: seller }).delete().catch(() => undefined);
  await db.orm.public.User.create({
    id: seller, email: "dbg@s.local", username: "dbg" + Date.now(), role: "USER", status: "ACTIVE",
  });
  await db.orm.public.SellerProfile.create({ userId: seller, status: "APPROVED", payoutEnabled: true });
  const token = generateAccessToken({ userId: seller, email: "dbg@s.local", role: "USER" });
  const created = await app
    .post("/resources")
    .set("Authorization", "Bearer " + token)
    .send({ slug: "dbg-route-" + Date.now().toString(36), title: "DBG", description: "debug description", type: "SCRIPT", price: 100 });
  console.log("create:", created.status);
  const slug = created.body.slug;
  const submit = await app
    .patch("/resources/" + slug)
    .set("Authorization", "Bearer " + token)
    .send({ status: "PENDING_REVIEW" });
  console.log("submit:", submit.status);

  const admin = "550e8400-e29b-41d4-a716-446655446802";
  await db.orm.public.User.where({ id: admin }).delete().catch(() => undefined);
  await db.orm.public.User.create({
    id: admin, email: "dbgadmin@s.local", username: "dbgadmin" + Date.now(), role: "ADMIN", status: "ACTIVE",
  });
  const adminToken = generateAccessToken({ userId: admin, email: "dbgadmin@s.local", role: "ADMIN" });
  const resource = await db.orm.public.Resource.where({ slug }).first();
  const publish = await app
    .patch("/admin/resources/" + resource!.id + "/status")
    .set("Authorization", "Bearer " + adminToken)
    .send({ status: "PUBLISHED", reason: "ok" });
  console.log("publish:", publish.status, JSON.stringify(publish.body).slice(0, 250));
  process.exit(0);
})();
