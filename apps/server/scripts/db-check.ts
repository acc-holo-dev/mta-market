// Temporary: diagnose Session family delete behavior.
import { db } from "../src/prisma/db";
import { generateRefreshToken } from "../src/lib/jwt";
import { hashRefreshToken, generateTokenId } from "../src/lib/tokenSecurity";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const EMAIL = "auth-flow-test@example.local";

async function main() {
  // Ensure user exists
  let user = await db.orm.public.User.where({ id: USER_ID }).first();
  if (!user) {
    user = await db.orm.public.User.create({
      id: USER_ID, email: EMAIL, username: "family_delete_test",
      role: "USER", status: "ACTIVE",
    });
  }

  const family = generateTokenId();
  const hashes: string[] = [];
  for (let i = 0; i < 2; i++) {
    const token = generateRefreshToken({ userId: USER_ID, email: EMAIL, role: "USER" });
    const hash = hashRefreshToken(token);
    hashes.push(hash);
    await db.orm.public.Session.create({
      userId: USER_ID,
      refreshTokenHash: hash,
      tokenFamily: family,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
  }

  const before = await db.orm.public.Session.where({ tokenFamily: family }).all();
  console.log("sessions in family before delete:", before.length);

  await db.orm.public.Session.where({ tokenFamily: family }).delete();

  const after = await db.orm.public.Session.where({ tokenFamily: family }).all();
  console.log("sessions in family after delete:", after.length);

  // cleanup
  for (const h of hashes) {
    await db.orm.public.Session.where({ refreshTokenHash: h }).delete().catch(() => undefined);
  }
  await db.orm.public.User.where({ id: USER_ID }).delete().catch(() => undefined);
  process.exit(0);
}

main();