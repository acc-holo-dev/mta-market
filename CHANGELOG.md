# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- WebSocket real-time notifications
- Advanced search with Elasticsearch
- Two-factor authentication (2FA)
- Seller analytics dashboard
- Automated seller payouts
- Refund system
- Multi-language support (i18n)

## [1.0.0] - 2025-01-XX

### 🎉 Initial Release

Complete production-ready MTA Market marketplace platform.

### Added

#### Backend (38 API endpoints)

- **Authentication**
  - OAuth2 Discord integration
  - JWT access + refresh tokens
  - Session management
  - `/auth/discord`, `/auth/discord/callback`, `/auth/refresh`, `/auth/logout`, `/auth/me`

- **Resources**
  - CRUD operations for resources
  - Version management
  - File uploads (local + S3/Cloudflare R2)
  - `/resources/*`, `/resources/:slug/versions/*`

- **Purchases & Payments**
  - Purchase creation and tracking
  - YooKassa payment integration
  - Webhook handling with signature verification
  - Payment simulation for development
  - `/purchases/*`, `/payments/*`

- **DRM System**
  - License activation with server binding
  - Keypair generation and verification
  - Installation management
  - License revocation
  - `/drm/activate`, `/drm/verify`, `/drm/my-licenses`, `/drm/revoke/:id`

- **Reviews & Ratings**
  - Resource reviews with 1-5 star ratings
  - Review moderation
  - Average rating calculation
  - `/resources/:slug/reviews/*`

- **Admin Panel**
  - Resource moderation (approve/reject)
  - User management (ban/unban, role changes)
  - Review deletion
  - Platform statistics
  - `/admin/*` (7 endpoints)

- **Email Notifications**
  - Welcome emails
  - Purchase confirmations
  - License activation notifications
  - Resource published notifications
  - Review notifications
  - Payout confirmations

- **Infrastructure**
  - PostgreSQL 16 + Prisma ORM 8
  - Redis 7 for caching and rate limiting
  - Rate limiting (10 req/s API, 5 req/s auth)
  - Health checks
  - Security headers

#### Frontend (Next.js 15 + React 19)

- **Pages**
  - Landing page with hero section
  - Resource catalog with grid layout
  - Resource detail page with purchase flow
  - User dashboard with purchase history
  - Authentication pages (Discord OAuth2)

- **Components**
  - Button (5 variants)
  - Card (with Header, Title, Description, Content, Footer)
  - Input (styled with dark mode)
  - Navbar (with auth state)

- **Features**
  - OAuth2 Discord authentication flow
  - State management (Zustand + React Query)
  - Automatic token refresh (axios interceptors)
  - Responsive design (mobile-first)
  - Dark mode support
  - Protected routes

#### DevOps & Deployment

- **Docker**
  - Multi-stage Dockerfiles (backend + frontend)
  - Non-root users for security
  - Health checks for all services
  - Optimized image sizes (~200MB backend, ~180MB frontend)

- **Docker Compose**
  - Development configuration
  - Production configuration with Nginx
  - Volume persistence
  - Network isolation

- **Nginx**
  - Reverse proxy for backend + frontend
  - SSL/TLS configuration
  - Rate limiting
  - Gzip compression
  - Static file caching
  - Security headers (CSP, X-Frame-Options, etc)

- **CI/CD (GitHub Actions)**
  - Automated linting and type checking
  - Build verification
  - Docker image building and pushing
  - GitHub Container Registry integration

- **Automation Scripts**
  - `deploy.sh` - automated deployment
  - `backup.sh` - automated database backups

#### Documentation

- Complete project documentation
- API documentation
- Deployment guide
- Contributing guide
- Stage-by-stage development summaries
- Architecture diagrams

### Security

- Role-based access control (USER/MODERATOR/ADMIN)
- Input validation
- SQL injection protection (Prisma ORM)
- XSS protection (React escaping)
- CSRF protection (SameSite cookies)
- DRM license verification
- Webhook signature verification
- Rate limiting (Redis-based)
- Security headers

### Technical Stack

- **Backend**: Node.js 24, Express.js, TypeScript
- **Database**: PostgreSQL 16, Prisma ORM 8
- **Cache**: Redis 7
- **Frontend**: Next.js 15, React 19, TailwindCSS 3
- **State**: Zustand, React Query
- **DevOps**: Docker, Docker Compose, GitHub Actions, Nginx
- **Integrations**: Discord OAuth2, YooKassa, Nodemailer, S3/R2

### Statistics

- 38 API endpoints
- 16 database models
- 5 frontend pages
- 6 UI components
- ~3500 lines of production code
- 100% TypeScript

## Release Notes

### v1.0.0 - Initial Release

This is the first production-ready release of MTA Market, a complete marketplace platform for MTA:SA resources with DRM protection, payment integration, and modern web interface.

**Key Features:**

- Full-featured REST API
- Discord OAuth2 authentication
- YooKassa payment processing
- DRM licensing system
- Email notifications
- Admin moderation panel
- Responsive web interface
- Docker deployment ready

**Installation:**

```bash
docker-compose up -d
```

**Documentation:**

- [README.md](README.md) - Quick start
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Complete overview

---

## Version History

- **[1.0.0]** - Initial release (2025-01-XX)

[Unreleased]: https://github.com/acc-holo-dev/mta-market/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/acc-holo-dev/mta-market/releases/tag/v1.0.0
