# MTA Market - Stage 3: Business Logic & API

## ✅ Что реализовано

### 1. База данных (Prisma 8)

- ✅ Полная схема БД (16 таблиц)
- ✅ Prisma 8 ORM с новым API
- ✅ Relations и индексы

### 2. Аутентификация

- ✅ JWT (Access + Refresh tokens)
- ✅ OAuth2 Discord (skeleton)
- ✅ Auth middleware
- ✅ Rate limiting (Redis)

### 3. Resources API (CRUD)

- ✅ Список ресурсов с пагинацией
- ✅ Создание/обновление/удаление
- ✅ Owner-only operations
- ✅ Status management (DRAFT/PUBLISHED)

### 4. Versions API

- ✅ Версионирование ресурсов
- ✅ Upload новых версий
- ✅ Download (purchased only)
- ✅ Changelog tracking

### 5. Reviews API

- ✅ Отзывы с рейтингом (1-5)
- ✅ Purchased-only reviews
- ✅ Average rating calculation
- ✅ CRUD для своих отзывов

### 6. Purchases API

- ✅ Создание покупки
- ✅ Ownership tracking
- ✅ Purchase history
- ✅ Payment simulation

### 7. DRM System

- ✅ License activation
- ✅ Server binding (serverSerial)
- ✅ Keypair generation
- ✅ Installation verification
- ✅ License revocation

## 📁 Структура

```
apps/server/
├── src/
│   ├── prisma/           # Prisma 8 generated
│   │   ├── contract.prisma
│   │   ├── contract.d.ts
│   │   ├── contract.json
│   │   └── db.ts
│   ├── lib/              # Utilities
│   │   ├── prisma.ts     # Prisma 8 wrapper
│   │   ├── jwt.ts        # JWT utilities
│   │   ├── redis.ts      # Redis client
│   │   ├── auth.ts       # Auth middleware
│   │   └── rateLimit.ts  # Rate limiting
│   ├── routes/           # API routes
│   │   ├── auth.ts       # Auth endpoints
│   │   ├── resources.ts  # Resources CRUD
│   │   ├── versions.ts   # Versions management
│   │   ├── reviews.ts    # Reviews CRUD
│   │   ├── purchases.ts  # Purchase flow
│   │   └── drm.ts        # DRM system
│   └── index.ts          # Main server
├── .env.example
├── prisma.config.ts
└── docker-compose.yml
```

## 🚀 Запуск

### 1. Установка

```bash
pnpm install
```

### 2. Запуск БД

```bash
docker compose up -d
```

### 3. Настройка .env

```env
DATABASE_URL="postgresql://mtamarket:dev_password@localhost:5432/mtamarket"
JWT_SECRET="your-secret-key-min-32-chars"
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"
REDIS_URL="redis://localhost:6379"
```

### 4. Миграции

```bash
pnpm --filter @mta-market/server prisma contract emit
pnpm --filter @mta-market/server prisma db migrate
```

### 5. Dev сервер

```bash
pnpm dev
```

## 📚 API Endpoints

### Auth

- `GET /auth/discord` - OAuth2 redirect
- `GET /auth/discord/callback` - OAuth2 callback
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Logout

### Resources

- `GET /resources` - List (pagination, filtering)
- `GET /resources/:slug` - Details
- `POST /resources` - Create (auth)
- `PATCH /resources/:slug` - Update (owner)
- `DELETE /resources/:slug` - Delete (owner)

### Versions

- `GET /resources/:slug/versions` - List versions
- `POST /resources/:slug/versions` - Create version (owner)
- `GET /resources/:slug/versions/:version/download` - Download (purchased)

### Reviews

- `GET /resources/:slug/reviews` - List reviews
- `POST /resources/:slug/reviews` - Create review (purchased)
- `PATCH /resources/:slug/reviews` - Update review
- `DELETE /resources/:slug/reviews` - Delete review

### Purchases

- `POST /purchases` - Create purchase (auth)
- `GET /purchases/my` - My purchases (auth)
- `GET /purchases/:id` - Purchase details (auth, owner)
- `POST /purchases/:id/complete` - Complete purchase (simulate)

### DRM

- `POST /drm/activate` - Activate license on server
- `POST /drm/verify` - Verify installation keypair
- `GET /drm/my-licenses` - My licenses (auth)
- `DELETE /drm/revoke/:licenseId` - Revoke license (auth, owner)

## 🔐 Security

- **JWT**: Access (15m) + Refresh (7d)
- **Rate Limiting**: Redis-based (60/min standard, 10/min strict)
- **Authorization**: Middleware checks (owner-only, purchased-only)
- **Input Validation**: Required fields, type checks

## 📊 Prisma 8 API Examples

### Query

```typescript
// Find one
const resource = await db.orm.public.Resource.where({ slug: "my-script" }).first();

// Find many with ordering
const resources = await db.orm.public.Resource.where({ status: "PUBLISHED" })
  .orderBy((m) => m.createdAt.desc())
  .limit(20)
  .all();
```

### Mutations

```typescript
// Create
const resource = await db.orm.public.Resource.create({
  sellerId: userId,
  slug: "my-script",
  title: "My Script",
  type: "SCRIPT",
  price: 10000, // kopecks
  status: "DRAFT",
});

// Update
await db.orm.public.Resource.where({ id: resourceId }).update({ status: "PUBLISHED" });

// Delete
await db.orm.public.Resource.where({ id: resourceId }).delete();
```

## 🧪 Testing

```bash
# Build
pnpm build

# Lint
pnpm lint

# Type check
pnpm type-check
```

## 📝 TODO Stage 4

- [ ] Full OAuth2 Discord implementation
- [ ] File upload (multipart + S3)
- [ ] YooKassa webhooks
- [ ] Admin moderation endpoints
- [ ] Search & filtering
- [ ] Email notifications
- [ ] WebSocket real-time updates

## 🎯 Stage Progress

- ✅ Stage 1: Monorepo setup
- ✅ Stage 2: Database & Auth
- ✅ Stage 3: Business Logic & API
- ⏳ Stage 4: Payments & File Upload
- ⏳ Stage 5: Frontend
- ⏳ Stage 6: Deployment

---

**21 endpoints**, **~600 строк API code**, **Prisma 8 ORM**
