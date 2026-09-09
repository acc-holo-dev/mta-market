// Shared helpers for the PLAN-001 browser E2E.
//
// NOTE: test workers must not spawn child processes (restricted
// environments), so DB assertions use a direct Postgres connection and the
// ADMIN account is created by the documented dev-admin script *before* the
// run (`pnpm test:e2e:admin`).
import { APIRequestContext, Page, expect } from "@playwright/test";
import { Client } from "pg";

export const API = process.env.E2E_API_URL || "http://localhost:3001";

/** Unique-per-run suffix so repeated runs never collide on unique columns. */
export const RUN = Date.now().toString(36);

// Fixed development ADMIN account (created idempotently by dev-admin.ts).
export const ADMIN_EMAIL = "e2e-admin@mtamarket.local";
export const ADMIN_USERNAME = "e2e-admin";
export const ADMIN_PASSWORD = "e2e-admin-password-123";

/** Direct Postgres query (assertions against real persisted state). */
export async function psql(query: string): Promise<string> {
  const client = new Client({
    host: "localhost",
    port: 5432,
    user: "mtamarket",
    password: "dev_password",
    database: "mtamarket",
  });
  await client.connect();
  try {
    const res = await client.query(query);
    const cell = res.rows[0]?.[Object.keys(res.rows[0] ?? {})[0]];
    return cell === undefined || cell === null ? "" : String(cell);
  } finally {
    await client.end();
  }
}

/** Minimal stored-ZIP builder (same format as the server-side test helper). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(entries: { path: string; content: string }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.path, "utf8");
    const dataBuf = Buffer.from(entry.content, "utf8");
    const crc = crc32(dataBuf);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuf, dataBuf);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDir, eocd]);
}

/**
 * A valid artifact ZIP as a Playwright file payload (the artifact pipeline
 * validates archives strictly).
 */
export function makeArtifact(name: string, marker: string) {
  return {
    name,
    mimeType: "application/zip",
    buffer: buildZip([{ path: "meta/main.lua", content: `return '${marker}'` }]),
  };
}

/** Password-login through the API; returns the access token. */
export async function apiLogin(
  request: APIRequestContext,
  login: string,
  password: string
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { login, password } });
  expect(res.status()).toBe(200);
  return (await res.json()).accessToken;
}

/** Register through the real register page UI. */
export async function uiRegister(page: Page, username: string): Promise<void> {
  await page.goto("/auth/register");
  await page.getByLabel("Имя пользователя").fill(username);
  await page.getByLabel("Email").fill(`${username}@e2e.local`);
  await page.locator("#password").first().fill("e2e-user-password-123");
  await page.locator("#confirmPassword").fill("e2e-user-password-123");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page.getByRole("button", { name: "Выход" })).toBeVisible({ timeout: 30_000 });
}

/** Login through the real login page. */
export async function uiLogin(page: Page, login: string, password: string): Promise<void> {
  await page.goto("/auth/login");
  await page.getByLabel("Имя пользователя или email").fill(login);
  await page.locator("#password").fill(password);
  await page.locator("form").getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("button", { name: "Выход" })).toBeVisible({ timeout: 30_000 });
}
