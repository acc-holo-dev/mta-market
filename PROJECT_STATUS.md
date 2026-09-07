# MTA Market — Project Status

**Last updated:** 2025-01-09  
**Current phase:** MVP / Pre-Production

---

## Executive Summary

MTA Market is a DRM-protected marketplace for MTA:SA server resources. The project has completed initial implementation of core features (backend API, frontend, Docker deployment, CI/CD) but **is not ready for production** until critical security issues are resolved and production gates are completed.

**Key metrics:**

- ✅ 38 backend API endpoints implemented
- ✅ 5 frontend pages (Next.js 15)
- ✅ Docker + CI/CD pipeline operational
- ⚠️ **7 of 17 P0 security issues resolved** (see below)
- ⏳ Production payment flow incomplete
- ⏳ DRM v2 cryptographic protocol pending

---

## ✅ What Works (Implemented)

### Backend API

- **Authentication:** Discord OAuth2 + JWT (access/refresh tokens)
- **Resources:** CRUD operations, versioning, seller dashboard
- **Purchases:** Order creation, YooKassa integration skeleton
- **DRM:** Basic license generation, server activation
- **Admin:** Resource moderation, user management, review moderation
- **Financial:** Transaction logging (basic)

### Frontend

- **Pages:** Home, catalog, resource detail, dashboard, auth callback
- **UI:** TailwindCSS + lucide-react, responsive design
- **State:** Zustand + TanStack Query

### Infrastructure

- **Database:** PostgreSQL 16 + Prisma 8
- **Cache:** Redis 7
- **Deployment:** Docker Compose (dev + prod), GitHub Actions CI/CD
- **Reverse Proxy:** Nginx with SSL, rate limiting, security headers

---

## ⚠️ P0 Security Issues (Critical)

### ✅ Resolved (commits 2e050a0, 5100abb)

1. **P0-01:** Payment bypass via `/purchases/:id/complete` — **REMOVED**
2. **P0-02:** YooKassa webhook — **IDEMPOTENT + PROVIDER VERIFICATION**
3. **P0-05:** Seller direct PUBLISHED status — **BLOCKED**
4. **P0-06:** Tokens in OAuth redirect URL — **MOVED TO COOKIES**
5. **P0-07:** Refresh token HttpOnly cookie — **IMPLEMENTED**
6. **P0-09:** JWT fallback secret — **REMOVED (throws on startup)**
7. **P0-10:** S3 signed downloads — **IMPLEMENTED (GetObjectCommand + TTL)**
8. **P0-11:** DRM v1 uses symmetric AES-GCM — **DOCUMENTED (v2 pending)**
9. **P0-12:** Webhook idempotency — **PaymentProviderEvent table added**
10. **P0-16:** README overstated status — **CORRECTED**

### ⏳ Remaining P0 Issues

11. **P0-03:** ID type consistency — schema uses `String @id` but runtime contract uses `Int @id`
12. **P0-04:** Missing input validation (Zod/class-validator)
13. **P0-08:** Password reset uses GET with token in URL
14. **P0-13:** Financial ledger incomplete (no double-entry bookkeeping)
15. **P0-14:** Sandbox upload validation missing
16. **P0-15:** Observability incomplete (no tracing/metrics)
17. **P0-17:** Stale architecture documentation
18. **P0-12:** Payment provider_payment_events table missing (no idempotency)
19. **P0-13:** Financial ledger incomplete (no double-entry bookkeeping)
20. **P0-14:** Sandbox validation missing (malicious resource upload)
21. **P0-15:** Observability incomplete (no tracing/metrics)
22. **P0-17:** Stale architecture documentation

---

## ⏳ Production Gates (Not Ready)

The following must be completed before production launch:

### Security & Payments

- [ ] Complete YooKassa production flow (IP whitelist + Basic Auth)
- [ ] Implement provider_payment_events idempotency table
- [ ] Add Zod input validation across all endpoints
- [ ] Fix ID type consistency (migrate to String CUID or keep Int with correct types)
- [ ] Implement S3 signed URLs for artifact downloads
- [ ] Add artifact signature verification

### DRM v2

- [ ] Keypair-based license signing (RSA/Ed25519)
- [ ] Public key distribution to MTA Guard module
- [ ] License signature verification in Lua
- [ ] Revocation list distribution

### Financial Integrity

- [ ] Double-entry ledger (transactions + journal_entries + ledger_accounts)
- [ ] Seller payout reconciliation
- [ ] Platform fee accounting
- [ ] Audit trail for all money movements

### Moderation & Safety

- [ ] Sandbox resource validation (static analysis + MTA load test)
- [ ] Automated malware scanning
- [ ] Manual review workflow for published resources
- [ ] DMCA takedown process

### Observability

- [ ] OpenTelemetry tracing
- [ ] Prometheus metrics
- [ ] Structured logging (JSON)
- [ ] Error tracking (Sentry or equivalent)
- [ ] Uptime monitoring

### Testing

- [ ] Integration tests (purchase flow, DRM activation)
- [ ] E2E tests (Playwright)
- [ ] Load testing (YooKassa webhook handling)
- [ ] Security testing (OWASP Top 10)

---

## 🔧 Known Technical Debt

1. **Type safety:** Many route handlers use `any` types
2. **Error handling:** Inconsistent error responses
3. **Rate limiting:** Global limits, not per-user/per-endpoint
4. **Database queries:** N+1 queries in `/purchases/my`
5. **Frontend auth:** Access token stored in memory (ephemeral, good), but refresh flow needs CSRF protection
6. **Logs:** Console.log instead of structured logging
7. **Migrations:** No Prisma migration history (schema only)

---

## 📊 Architecture Overview

### Current (Stage 7)

```
[Frontend: Next.js 15]
       ↓ HTTP
[Nginx reverse proxy]
       ↓
[Backend: Express + Prisma]
       ↓
[PostgreSQL 16] + [Redis 7]
```

### Target (Production)

```
[Frontend: Next.js 15]
       ↓ HTTPS + CORS
[Nginx: SSL, rate limit, WAF]
       ↓
[Backend: Express + Prisma + OpenTelemetry]
       ↓
[PostgreSQL 16: ACID transactions]
[Redis 7: sessions + rate limits]
[S3/R2: signed artifacts]
[Sentry: error tracking]
[Prometheus: metrics]
```

---

## 🛣️ Roadmap to Production

### Phase 1: P0 Security (Current)

- ✅ Remove payment bypasses
- ✅ Fix token handling
- ⏳ Complete P0-03 through P0-17

### Phase 2: Payment & Financial Integrity

- YooKassa production integration
- Double-entry ledger
- Seller payout automation

### Phase 3: DRM v2

- Keypair-based signing
- MTA Guard module updates
- Revocation infrastructure

### Phase 4: Observability & Testing

- OpenTelemetry + Prometheus
- Integration + E2E tests
- Load testing

### Phase 5: Closed Beta

- Invite 10-20 trusted sellers
- Manual moderation
- Bug bounty program

### Phase 6: Public Launch

- Marketing campaign
- Growth features (bundles, subscriptions, affiliates)

---

## 🚫 What NOT to Do Before Production

1. **Do not accept real money** — YooKassa integration incomplete
2. **Do not deploy to public internet** — P0 security issues remain
3. **Do not trust user-uploaded artifacts** — no sandbox validation
4. **Do not promise refunds** — financial ledger incomplete
5. **Do not scale horizontally** — session store not distributed-ready

---

## 📞 Contact & Contribution

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

For security issues, email: security@mtamarket.com (placeholder — configure real email)

---

**Status legend:**

- ✅ Complete
- ⏳ In progress
- ⚠️ Blocked / requires decision
- ❌ Not started
