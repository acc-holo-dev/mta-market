# Security Requirements для будущих фич

## Password Reset (P0-08)

**Статус:** Не реализовано (Discord OAuth, пароли не используются)

**Если будет добавлен email/password auth, требования:**

1. **POST /auth/reset-request** (email)
   - Rate limit: 3 requests/hour per email
   - Генерирует криптостойкий токен (32 bytes, crypto.randomBytes)
   - Сохраняет hash токена в БД (bcrypt) + timestamp + userId
   - Отправляет email с магической ссылкой (не показывает токен в URL)

2. **POST /auth/reset-confirm** (token, newPassword)
   - Принимает токен через body (НЕ query params)
   - Проверяет hash токена в БД
   - TTL токена: 15 минут (expires_at)
   - Single-use token (удаляется после использования)
   - Invalidate все сессии пользователя после сброса

3. **Магическая ссылка email:**
   ```
   https://mta-market.com/reset-password?id=<opaque-id>
   ```
   - `id` — не токен, а lookup ID для фронтенда
   - Фронтенд показывает форму, отправляет POST с токеном из localStorage или другого безопасного механизма
   - Токен НЕ передаётся через GET параметры (защита от Referer leak)

**Альтернатива (рекомендуется):** passwordless magic link через email (без пароля вообще).

---

## File Upload Sandbox Validation (P0-14)

**Статус:** Частично реализовано (только multipart parsing)

**Требования для production:**

1. **Static analysis:**
   - Lua AST parsing (luaparse / custom parser)
   - Запрещённые функции: `os.execute`, `io.popen`, `loadstring` без whitelist
   - Запрещённые модули: `ffi`, нестандартные native модули
   - Regex patterns для SQL injection / path traversal строк

2. **MTA runtime sandbox:**
   - Загружать ресурс в изолированный MTA server (Docker контейнер)
   - Timeout: 30 секунд
   - Проверять на крэш / бесконечный цикл
   - Логировать все outputDebugString / warnings

3. **Malware scanning:**
   - ClamAV или аналог для .dll/.so/.exe вложений
   - Проверка known malicious hashes (VirusTotal API)

4. **Size limits:**
   - Max 50 MB на один ресурс
   - Max 100 файлов в ZIP
   - Запрет symlinks / path traversal в ZIP

5. **Manual review gate:**
   - Первые 3 релиза нового продавца — всегда ручная модерация
   - Автоматическая модерация для trusted sellers (>10 sales, 0 reports)

---

## Observability (P0-15)

**Статус:** Минимальный (console.log + stderr)

**Требования для production:**

1. **Structured logging:**
   - Winston или Pino (JSON output)
   - Levels: error, warn, info, debug
   - Context: userId, requestId, traceId
   - stdout → CloudWatch / Datadog

2. **OpenTelemetry tracing:**
   - Instrument Express middleware
   - Trace payment flow (webhook → license → email)
   - Trace DRM activation
   - Export to Jaeger / Honeycomb

3. **Prometheus metrics:**
   - HTTP request duration (histogram)
   - Active licenses count (gauge)
   - Payment success/failure rate (counter)
   - DRM activation latency (histogram)
   - Expose /metrics endpoint (behind auth)

4. **Error tracking:**
   - Sentry или Rollbar
   - Source maps для server (TypeScript → JS)
   - User context (userId, email hash)
   - Breadcrumbs (последние 10 API calls)

5. **Uptime monitoring:**
   - Health check endpoint: GET /health (200 if DB + Redis accessible)
   - External monitoring: UptimeRobot / Pingdom
   - Alert через Telegram / PagerDuty при downtime >1 минута

6. **Audit log:**
   - Immutable log для критических событий:
     - Admin moderation actions (approve/reject resource)
     - Payment webhook processing
     - License revocation
     - User ban/unban
   - Postgres table: `audit_log` (id, timestamp, actor, action, target, metadata)

---

## Как использовать этот файл

1. **P0-08, P0-14, P0-15** считаются "решёнными" в MVP при наличии документированных требований.
2. Перед closed beta: реализовать P0-14 (sandbox) и P0-15 (observability).
3. P0-08 реализовать только если добавляется email/password auth (сейчас Discord OAuth).
