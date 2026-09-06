# 🚀 Для человека: установка, запуск, обновление (Runbook)

> Этот документ — для «человека у сервера»: вас завтра или вас через год.
> Здесь написано, как поднять проект с нуля, обновить его и не сломать.

---

## 1. Что нужно установить (один раз)

| Инструмент         | Для чего                                | Ссылка      |
| ------------------ | --------------------------------------- | ----------- |
| Node.js 20+        | запускает Backend + собирает Frontend   | nodejs.org  |
| Docker Desktop     | PostgreSQL, Redis, MinIO одной командой | docker.com  |
| Git                | скачивание и обновление кода            | git-scm.com |
| CMake + компилятор | сборка DRM-модуля                       | cmake.org   |

Проверка: `node -v`, `docker -v`, `git --version` — все должны что-то вывести.

---

## 2. Установка проекта с нуля

```bash
# 1. Склонировать репозиторий
git clone <адрес-репозитория>
cd mta-market

# 2. Скопировать шаблон окружения и заполнить переменные
cp .env.example .env
# (открыть .env и заполнить: пароли БД, ключи ЮKassa, SMTP)

# 3. Запустить PostgreSQL + Redis + MinIO
docker-compose -f infra/docker-compose.yml up -d

# 4. Установить зависимости Backend и применить миграции
cd apps/server && npm install && npm run migrate

# 5. Установить зависимости Frontend
cd ../web && npm install

# 6. Запустить Backend и Frontend в двух терминалах
npm run dev
```

После этого:

- Сайт доступен на `http://localhost:3000`
- Backend API на `http://localhost:4000`

---

## 3. Обновление проекта (когда что-то изменилось)

```bash
# 1. Зайти в папку проекта
cd mta-market

# 2. Скачать свежий код
git pull

# 3. Обновить зависимости и применить миграции БД
cd apps/server && npm install && npm run migrate

# 4. Перезапустить Backend (и проверить логи)
npm run build && pm2 restart mta-market
```

---

## 4. Что где лежит (шпаргалка)

```
.env                    # Пароли и ключи. НИКОГДА не коммитить!
apps/web                # Frontend — то, что видит пользователь в браузере
apps/server             # Backend — весь код логики
apps/server/src/db      # Схема БД и миграции
apps/server/src/modules # Модули: auth, licenses, payments...
packages/drm-module     # C++ модуль для MTA-серверов
infra/                  # Docker, Nginx, скрипты деплоя
docs/                   # Эта документация
```

---

## 5. Частые проблемы (FAQ)

| Симптом                       | Причина                   | Решение                        |
| ----------------------------- | ------------------------- | ------------------------------ |
| `ECONNREFUSED localhost:5432` | не запущен PostgreSQL     | `docker-compose up -d`         |
| Письма не приходят            | не настроен SMTP в `.env` | проверить `.env`, логи Backend |
| Модуль DRM не отвечает        | блокирует firewall        | открыть исходящий HTTPS на API |
| Frontend «пустой»             | Backend не запущен        | проверить оба процесса         |

---

## 6. Резервное копирование (делать регулярно!)

```bash
# Каждый день, автоматически через cron (проверить: crontab -e)
0 3 * * * pg_dump -U mta_market mta_market > /backup/db_$(date +\%F).sql
```

**Золотое правило:** бэкап без проверки восстановления — это не бэкуп.
Раз в месяц делайте восстановление на тестовом сервере.
