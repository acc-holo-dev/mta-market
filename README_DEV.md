# MTA Market — Developer Guide

> **DRM-защищённая площадка продаж серверных ресурсов для MTA:SA**

[![CI](https://github.com/acc-holo-dev/mta-market/actions/workflows/ci.yml/badge.svg)](https://github.com/acc-holo-dev/mta-market/actions/workflows/ci.yml)

## 🏗️ Архитектура монорепозитория

```
mta-market/
├── apps/
│   ├── web/          Next.js 15 фронтенд (React 19 + TypeScript + Tailwind)
│   └── server/       Node.js бэкенд (Express + TypeScript)
├── packages/
│   ├── tsconfig/     Shared TypeScript конфигурации
│   └── eslint-config/ Shared ESLint конфигурации
├── document/         19 документов спецификации проекта
└── docker-compose.yml PostgreSQL 16 + Redis 7
```

## 🚀 Быстрый старт

### Требования

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm` или corepack)
- Docker (для PostgreSQL/Redis)

### Установка

```bash
# Установить зависимости
pnpm install

# Запустить локальную БД (PostgreSQL + Redis)
docker-compose up -d

# Запустить dev-серверы (web на :3000, server на :3001)
pnpm dev
```

### Команды

```bash
pnpm dev          # Запустить все приложения в dev-режиме
pnpm build        # Собрать все приложения для продакшена
pnpm lint         # Проверить код линтерами
pnpm format       # Отформатировать код (Prettier)
pnpm type-check   # Проверить типы TypeScript
```

## 📦 Приложения

### apps/web (Next.js 15)

```bash
cd apps/web
pnpm dev          # Запустить на http://localhost:3000
pnpm build        # Собрать для продакшена
pnpm lint         # Проверить линтером
```

### apps/server (Express)

```bash
cd apps/server
pnpm dev          # Запустить на http://localhost:3001
pnpm build        # Скомпилировать TypeScript → dist/
pnpm start        # Запустить скомпилированный сервер
```

## 🗄️ База данных

```bash
# Запустить PostgreSQL + Redis
docker-compose up -d

# Остановить
docker-compose down

# Удалить данные (сбросить БД)
docker-compose down -v
```

**Подключение к PostgreSQL:**

- Host: `localhost:5432`
- User: `mtamarket`
- Password: `dev_password_change_in_production`
- Database: `mtamarket`

**Подключение к Redis:**

- Host: `localhost:6379`

## 📚 Документация

Полная спецификация проекта — 19 документов в `document/`:

- [00_DOCUMENTATION_MAP.md](document/00_DOCUMENTATION_MAP.md) — карта документации
- [12_ROADMAP.md](document/12_ROADMAP.md) — дорожная карта (Stages 0–9)
- [19_STAGE_0_SPIKE_REPORT.md](document/19_STAGE_0_SPIKE_REPORT.md) — отчёт DRM feasibility spike (✅ пройден)

## 🎯 Текущий статус: Stage 1

**Stage 1 — Каркас монорепозитория** (в процессе):

- ✅ Turborepo + npm workspaces
- ✅ apps/web (Next.js 15 + React 19 + TypeScript + Tailwind)
- ✅ apps/server (Node.js + Express + TypeScript)
- ✅ Shared packages (tsconfig, eslint-config)
- ✅ docker-compose.yml (PostgreSQL 16 + Redis 7)
- ✅ CI/CD (GitHub Actions: lint + type-check + build)
- ⏳ Первый запуск + проверка сборки

## 🔗 Связанные репозитории

- [mta-guard-module](https://github.com/acc-holo-dev/mta-guard-module) — C++ модуль Market Manager (DRM-движок для MTA-серверов)

## 📄 Лицензия

Proprietary — частный проект.
