// Temporary: reproduce register + me failure.
import request from "supertest";
import { createApp } from "../src/app";

(async () => {
  const app = request(createApp());
  const suffix = Date.now().toString(36);
  const reg = await app.post("/auth/register").send({
    username: `dbg_${suffix}`,
    email: `dbg_${suffix}@plan001.local`,
    password: "plan001-password",
    confirmPassword: "plan001-password",
  });
  console.log("register:", reg.status, JSON.stringify(reg.body).slice(0, 300));
  if (reg.status === 201) {
    const me = await app
      .get("/auth/me")
      .set("Authorization", `Bearer ${reg.body.accessToken}`);
    console.log("me:", me.status, JSON.stringify(me.body).slice(0, 300));
  }
  process.exit(0);
})();
