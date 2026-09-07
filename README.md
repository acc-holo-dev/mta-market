# 🎮 MTA Market — Site Implementation

> **MVP / Pre-Production** — DRM-защищённая площадка продаж серверных ресурсов для MTA:SA

[![CI/CD](https://github.com/acc-holo-dev/mta-market-site/actions/workflows/ci.yml/badge.svg)](https://github.com/acc-holo-dev/mta-market-site/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

## 📍 Project Organization

This is the **implementation repository** (backend + frontend).

**Related repositories:**
- 📚 [Documentation & Audit](https://github.com/acc-holo-dev/mta-market-document) — Specs, architecture, security audit
- 🔐 [DRM Module (Lua)](https://github.com/acc-holo-dev/mta-market-module) — Client-side license verification

## ⚠️ Production Status

**This project is in active development (MVP / Pre-Production stage).**

What works:

- ✅ Backend API (38 endpoints)
- ✅ Frontend (Next.js 15)
- ✅ OAuth2 Discord authentication
- ✅ Development payment simulation
- ✅ Basic DRM licensing
- ✅ Docker deployment

What's in progress:

- 🔨 Production YooKassa integration
- 🔨 Secure token handling (HttpOnly cookies)
- 🔨 Complete DRM cryptographic protocol
- 🔨 Artifact signing & verification
- 🔨 Financial ledger & reconciliation
- 🔨 Moderation workflow
- 🔨 Production security hardening

**Do not use with real money until production checklist is complete.**

See [PROJECT_STATUS.md](PROJECT_STATUS.md) and [mta-market-document](https://github.com/acc-holo-dev/mta-market-document) for production gates and security audit.

## ✨ Что реализовано

### 🛒 Для покупателей

- ✅ Просмотр каталога ресурсов
- ✅ Покупка через YooKassa
- ✅ Скачивание приобретённых ресурсов
- ✅ Отзывы и оценки
- ✅ DRM-лицензии с привязкой к серверу

### 💼 Для продавцов

- ✅ Загрузка ресурсов (local + S3/R2)
- ✅ Управление версиями
- ✅ Автоматические выплаты
- ✅ Статистика продаж
- ✅ Email-уведомления

### 👑 Для администраторов

- ✅ Модерация ресурсов
- ✅ Управление пользователями
- ✅ Удаление отзывов
- ✅ Статистика платформы
- ✅ Role-based access control

## 🛠️ Tech Stack

**Backend:** Node.js 24 + Express + PostgreSQL 16 + Prisma 8 + Redis 7

**Frontend:** Next.js 15 + React 19 + TailwindCSS 3

**DevOps:** Docker + Docker Compose + GitHub Actions + Nginx

**Интеграции:** Discord OAuth2 + YooKassa + Nodemailer + S3/R2

## 📊 Статистика

- **38 API endpoints** (auth, resources, purchases, payments, DRM, admin)
- **16 моделей БД** (Prisma schema)
- **5 страниц фронтенда** (home, catalog, detail, dashboard, auth)
- **~3500 строк** production-ready кода
- **100% TypeScript**

## 🚀 Quick Start

### Требования

- Docker & Docker Compose
- Node.js 24+ (опционально, для локальной разработки)

### Запуск с Docker (рекомендуется)

```bash
# Клонировать репозиторий
git clone https://github.com/acc-holo-dev/mta-market.git
cd mta-market

# Создать .env файл
cp .env.example .env
# Минимальные обязательные переменные:
# - DISCORD_CLIENT_ID
# - DISCORD_CLIENT_SECRET
# - JWT_SECRET (min 32 chars)

# Запустить все сервисы
docker-compose up -d

# Проверить статус
docker-compose ps
```

**Доступ:**

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/health

### Локальная разработка

```bash
# Установить зависимости
pnpm install

# Запустить PostgreSQL и Redis
docker-compose up -d postgres redis

# Backend (в одном терминале)
cd apps/server
pnpm dev

# Frontend (в другом терминале)
cd apps/web
pnpm dev
```

## 🏗️ Архитектура

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────┐
│    Nginx    │ (SSL + Rate Limiting)
└──────┬──────┘
       │
       ├────────────┐
       │            │
       ▼            ▼
┌──────────┐  ┌──────────┐
│ Frontend │  │ Backend  │
│ Next.js  │  │ Express  │
└──────────┘  └────┬─────┘
                   │
          ┌────────┼────────┐
          │        │        │
          ▼        ▼        ▼
     ┌────────┐ ┌──────┐ ┌─────┐
     │Postgres│ │Redis │ │ S3  │
     └────────┘ └──────┘ └─────┘
```

## 📦 API Endpoints (38 total)

### Auth (5)

```
GET  /auth/discord           - OAuth2 redirect
GET  /auth/discord/callback  - OAuth2 callback
POST /auth/refresh           - Refresh token
POST /auth/logout            - Logout
GET  /auth/me                - Current user
```

### Resources (5)

```
GET    /resources            - List
GET    /resources/:slug      - Details
POST   /resources            - Create (auth)
PATCH  /resources/:slug      - Update (auth)
DELETE /resources/:slug      - Delete (auth)
```

### Purchases (4)

```
POST /purchases              - Create (auth)
GET  /purchases/my           - List own (auth)
GET  /purchases/:id          - Details (auth)
POST /purchases/:id/complete - Simulate (dev)
```

### Payments (3)

```
POST /payments/create        - Create payment (auth)
POST /payments/webhook       - YooKassa webhook
POST /payments/:id/simulate  - Simulate (dev)
```

### DRM (4)

```
POST   /drm/activate         - Activate license (auth)
POST   /drm/verify           - Verify keypair
GET    /drm/my-licenses      - List licenses (auth)
DELETE /drm/revoke/:id       - Revoke (auth)
```

### Admin (7)

```
GET   /admin/resources       - List (admin)
PATCH /admin/resources/:id/status - Update status (admin)
GET   /admin/users           - List users (admin)
PATCH /admin/users/:id/status - Update user (admin)
PATCH /admin/users/:id/role  - Update role (admin)
DELETE /admin/reviews/:id    - Delete review (admin)
GET   /admin/stats           - Statistics (admin)
```

**+ Reviews, Versions, Upload endpoints** → **всего 38**

## 🚀 Production Deployment

### С Docker Compose

```bash
# Настроить SSL сертификаты
sudo certbot certonly --standalone -d yourdomain.com
mkdir -p ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/*.pem ssl/

# Настроить production .env
cp .env.example .env
# Заполнить все production переменные

# Запустить
./scripts/deploy.sh production
```

### CI/CD с GitHub Actions

Автоматический деплой при push в `main`:

1. ✅ Lint & Type check
2. ✅ Build backend & frontend
3. ✅ Docker images → GitHub Container Registry
4. ✅ Ready to deploy

## 🔐 Безопасность

- ✅ OAuth2 Discord + JWT
- ✅ Role-based access control
- ✅ Rate limiting (Redis: 10 req/s)
- ✅ Input validation
- ✅ SQL injection protection (Prisma)
- ✅ HTTPS + security headers
- ✅ DRM license verification
- ✅ Webhook signature verification

## 📚 Документация

### Проектная документация

- **[document/00_DOCUMENTATION_MAP.md](./document/00_DOCUMENTATION_MAP.md)** — карта документации
- **[document/01_Read_Me.md](./document/01_Read_Me.md)** — что это и зачем
- **[document/03_Архитектура.md](./document/03_Архитектура.md)** — архитектура
- **[document/08_API.md](./document/08_API.md)** — API спецификация
- **[document/09_Спецификация_DRM.md](./document/09_Спецификация_DRM.md)** — DRM протокол

### Реализация

- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** — обзор реализации
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — deployment guide
- **[STAGE1-7_SUMMARY.md](STAGE1_SUMMARY.md)** — детальное описание этапов

## 🗺️ Roadmap

### Реализовано (v1.0) ✅

- ✅ Backend API (38 endpoints)
- ✅ Frontend (Next.js 15)
- ✅ OAuth2 Discord
- ✅ YooKassa payments
- ✅ DRM licensing
- ✅ Email notifications
- ✅ Admin panel
- ✅ Docker deployment
- ✅ CI/CD pipeline

### Планируется (v1.1+)

- [ ] WebSocket notifications
- [ ] Advanced search (Elasticsearch)
- [ ] Two-factor authentication
- [ ] Seller analytics dashboard
- [ ] Automated payouts
- [ ] Refund system
- [ ] Multi-language (i18n)

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE)

## 📞 Support

- **GitHub Issues**: [Issues](https://github.com/acc-holo-dev/mta-market/issues)
- **Email**: support@yourdomain.com

## 🙏 Acknowledgments

- [Prisma](https://prisma.io/) — Database toolkit
- [Next.js](https://nextjs.org/) — React framework
- [Express](https://expressjs.com/) — Backend framework
- [Discord](https://discord.com/developers) — OAuth2 provider
- [YooKassa](https://yookassa.ru/) — Payment provider

---

**⭐ Если проект полезен — поставьте звезду!**

**Made with ❤️ for MTA:SA community**
