# 🗄️ База данных — полная схема

> PostgreSQL 16. Все таблицы, ключевые поля, связи и миграции.
> Обозначения: PK — первичный ключ, FK — внешний ключ, IDX — индекс.

---

## 1. Схема связей (ERD)

```
users ─┬─► seller_profiles
       ├─► purchases ─► licenses ─► license_installations
       ├─► reviews                  │
       ├─► financial_transactions  └─► resources ─► resource_versions
       └─► payouts                          │
                                            └─► categories

Сущности orders / order_bids (биржа заказов) — второй продукт,
НЕ входит в MVP. Проектирование отложено (см. 12_ROADMAP.md).
```

## 2. Таблицы

### users — пользователи

```sql
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT,                       -- NULL если только OAuth
    role            TEXT NOT NULL DEFAULT 'user', -- user|seller|admin
    status          TEXT NOT NULL DEFAULT 'active', -- active|banned
    nickname        TEXT NOT NULL,
    avatar_url      TEXT,
    discord_id      TEXT UNIQUE,
    email_verified  BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### seller_profiles — профили продавцов

```sql
CREATE TABLE seller_profiles (
    user_id       BIGINT PRIMARY KEY REFERENCES users(id),
    display_name  TEXT NOT NULL,
    description   TEXT,
    tariff        TEXT NOT NULL DEFAULT 'free', -- free|pro|business
    total_sales   INTEGER NOT NULL DEFAULT 0,
    avg_rating    NUMERIC(3,2) NOT NULL DEFAULT 0,
    deposit_cents BIGINT NOT NULL DEFAULT 0      -- депозит гаранта
);
```

### categories — категории каталога

```sql
CREATE TABLE categories (
    id       SERIAL PRIMARY KEY,
    slug     TEXT NOT NULL UNIQUE,   -- 'vehicles', 'admin-tools', ...
    name     TEXT NOT NULL
);
```

### resources — товары

```sql
CREATE TABLE resources (
    id            BIGSERIAL PRIMARY KEY,
    seller_id     BIGINT NOT NULL REFERENCES users(id),
    category_id   INT NOT NULL REFERENCES categories(id),
    slug          TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL,            -- Markdown
    price_cents   BIGINT NOT NULL,          -- разовая покупка
    sub_month     BIGINT,                   -- подписка, мес (NULL = нет)
    sub_year      BIGINT,                   -- подписка, год
    status        TEXT NOT NULL DEFAULT 'draft', -- draft|review|published|archived
    cover_url     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_seller ON resources(seller_id);
```

### resource_versions — версии товара

```sql
CREATE TABLE resource_versions (
    id             BIGSERIAL PRIMARY KEY,
    resource_id    BIGINT NOT NULL REFERENCES resources(id),
    version        TEXT NOT NULL,            -- '1.2.0'
    changelog      TEXT,
    blob_s3_key    TEXT NOT NULL,            -- путь к зашифрованному blob
    checksum       TEXT NOT NULL,            -- SHA-256 для integrity-check
    min_mta_version TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (resource_id, version)
);
```

### purchases — покупки (с escrow-статусом)

```sql
-- ⚠️ По итогам аудита: содержит SNAPSHOT товара на момент покупки.
-- Продавец может переименовать/перезаписать ресурс — история покупки
-- должна остаться неизменной (спор через полгода решается по snapshot'у).
CREATE TABLE purchases (
    id              BIGSERIAL PRIMARY KEY,
    buyer_id        BIGINT NOT NULL REFERENCES users(id),
    resource_version_id BIGINT NOT NULL REFERENCES resource_versions(id),
    amount_cents    BIGINT NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'RUB',
    -- snapshot на момент покупки:
    product_title_snapshot TEXT NOT NULL,
    seller_id_snapshot     BIGINT NOT NULL,
    platform_fee_cents     BIGINT NOT NULL,      -- комиссия площадки
    seller_amount_cents    BIGINT NOT NULL,      -- сколько получит продавец
    -- платеж:
    yk_payment_id   TEXT,
    escrow_status   TEXT NOT NULL DEFAULT 'in_escrow',
                    -- in_escrow|released|refunded
    escrow_expires  TIMESTAMPTZ,            -- дедлайн автоподтверждения
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### licenses — лицензии ⭐ (ядро)

```sql
CREATE TABLE licenses (
    id                  BIGSERIAL PRIMARY KEY,
    purchase_id         BIGINT REFERENCES purchases(id),
    user_id             BIGINT NOT NULL REFERENCES users(id),
    resource_id         BIGINT NOT NULL REFERENCES resources(id),
    status              TEXT NOT NULL DEFAULT 'active',
                        -- active|expiring|revoked|expired
    watermark_id        TEXT NOT NULL,       -- ID для forensic-поиска утечек
    expires_at          TIMESTAMPTZ,         -- NULL = бессрочная
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_licenses_user ON licenses(user_id);
CREATE INDEX idx_licenses_status ON licenses(status);
```

### license_installations — установки ⭐ (v2: вместо одиночного hwid_hash)

```sql
-- По итогам аудита: identity = cryptographic installation key,
-- а HWID-подобные характеристики — только risk-signal.
-- Одна лицензия → N установок (лимит настраивается).
CREATE TABLE license_installations (
    id              BIGSERIAL PRIMARY KEY,
    license_id      BIGINT NOT NULL REFERENCES licenses(id),
    installation_id TEXT NOT NULL UNIQUE,   -- random, сгенерирован модулем
    public_key      TEXT NOT NULL,          -- публичный ключ установки
    label           TEXT,                    -- "Основной сервер", "Тест"
    status          TEXT NOT NULL DEFAULT 'active', -- active|revoked
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ,
    last_lease_expires TIMESTAMPTZ,          -- до когда действует lease
    last_ip         INET,                    -- risk-signal, не identity
    last_mta_version TEXT,
    hw_signals      JSONB,                   -- опциональная телеметрия
    revoked_at      TIMESTAMPTZ
);
CREATE INDEX idx_installs_license ON license_installations(license_id);
```

### hwid_history — журнал смен установок (v2)

```sql
-- Журнал переименован по смыслу: теперь логируем смены/обытия
-- установок, а не «HWID», и фиксируем risk-signals.
CREATE TABLE installation_events (
    id              BIGSERIAL PRIMARY KEY,
    installation_id BIGINT NOT NULL REFERENCES license_installations(id),
    event           TEXT NOT NULL,   -- activated|key_regen|lease|anomaly
    ip              INET,
    details         JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### financial_transactions — финансовый ledger ⭐ (v2, по итогам аудита)

```sql
-- IMMUTABLE. purchase != payment != settlement != payout.
-- Каждая операция с деньгами — отдельная запись; сумма балансов всегда
-- сходится (см. invariant tests в 11_Тестирование.md).
CREATE TABLE financial_transactions (
    id              BIGSERIAL PRIMARY KEY,
    purchase_id     BIGINT REFERENCES purchases(id),
    seller_id       BIGINT REFERENCES users(id),
    tx_type         TEXT NOT NULL,
                    -- payment_received|platform_fee|provider_fee
                    -- |seller_pending|seller_paid|refund|chargeback|adjustment
    amount_cents    BIGINT NOT NULL,      -- >0 дебет, <0 кредит (или signed)
    currency        TEXT NOT NULL DEFAULT 'RUB',
    provider_tx_id  TEXT,                  -- ID транзакции ЮKassa
    balance_after   BIGINT NOT NULL,      -- баланс продавца после операции
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fintrans_seller ON financial_transactions(seller_id);
CREATE INDEX idx_fintrans_purchase ON financial_transactions(purchase_id);
```

### payouts — выплаты продавцам (v2)

```sql
CREATE TABLE payouts (
    id          BIGSERIAL PRIMARY KEY,
    seller_id   BIGINT NOT NULL REFERENCES users(id),
    amount_cents BIGINT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed
    period_start TIMESTAMPTZ,
    period_end   TIMESTAMPTZ,
    provider_payout_id TEXT,               -- ID выплаты у провайдера
    sent_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### resources: полнотекстовый поиск (v2)

```sql
-- PostgreSQL FTS + GIN — вместо Meilisearch на старте
ALTER TABLE resources ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector('russian', coalesce(title,'') || ' ' ||
                    coalesce(description,''))
    ) STORED;
CREATE INDEX idx_resources_search ON resources USING GIN (search_vector);
-- Запрос: SELECT * FROM resources
--   WHERE search_vector @@ websearch_to_tsquery('russian', 'авиация');
```

### subscriptions — подписки ⚠️ (отложено, НЕ в MVP)

```sql
-- По итогам аудита: подписки = огромный пласт логики (renewal, failed
-- payment, grace, cancel, reactivation, proration, price changes).
-- В MVP — только one-time license. Таблица оставлена как задел.
CREATE TABLE subscriptions (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    resource_id BIGINT NOT NULL REFERENCES resources(id),
    plan        TEXT NOT NULL,               -- month|year
    renews_at   TIMESTAMPTZ,                 -- NULL = отменена
    status      TEXT NOT NULL DEFAULT 'active', -- active|canceled|past_due
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### reviews — отзывы

```sql
-- ⚠️ Инвариант (по итогам аудита): review.user_id == purchase.buyer_id
-- и review.resource_id == purchase.resource_version.resource_id.
-- user_id и resource_id — денормализация ради выборок; БД гарантирует
-- консистентность через транзакцию + CHECK в приложении, альтернатива —
-- брать их только через JOIN с purchases.
CREATE TABLE reviews (
    id          BIGSERIAL PRIMARY KEY,
    purchase_id BIGINT NOT NULL UNIQUE REFERENCES purchases(id), -- UNIQUE = 1 отзыв на покупку
    user_id     BIGINT NOT NULL REFERENCES users(id),
    resource_id BIGINT NOT NULL REFERENCES resources(id),
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'visible', -- visible|hidden
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### disputes — споры

```sql
CREATE TABLE disputes (
    id          BIGSERIAL PRIMARY KEY,
    purchase_id BIGINT NOT NULL REFERENCES purchases(id),
    opened_by    BIGINT NOT NULL REFERENCES users(id),
    reason      TEXT NOT NULL,
    resolution  TEXT,                       -- решение админа
    status      TEXT NOT NULL DEFAULT 'open', -- open|resolved
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### audit_log — журнал действий (важно для отладки и споров)

```sql
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    actor_id   BIGINT REFERENCES users(id),
    action     TEXT NOT NULL,   -- 'license.revoked', 'payout.sent', ...
    entity_type TEXT,
    entity_id  BIGINT,
    meta       JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 3. Миграции

Все изменения схемы — через версию миграций (никаких правок руками):

```bash
npm run migrate create "add_licenses_table"  # создать миграцию
npm run migrate up                           # применить
npm run migrate down                         # откатить
```

## 4. Правила

1. Никогда не удаляем данные — только меняем статус (`status`).
   Покупатель с историей покупок важнее «чистой» БД.
2. Деньги — всегда `BIGINT` в копейках (`_cents`). Никогда `FLOAT`.
3. Каждая операция с деньгами — запись в `audit_log`.
4. `ON DELETE RESTRICT` везде: пользователя с покупками удалить нельзя.
