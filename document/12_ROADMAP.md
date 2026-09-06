# 🗺️ ROADMAP — дорожная карта разработки

> **v2 — по итогам внешнего аудита.** Прежняя версия обещала «MVP за 5
> недель» при фактических фазах на 7 недель и включала ~6 продуктов
> вместо одного. Теперь: scope-based (не calendar-based), MVP сокращён,
> доказательство технических рисков — ДО всей разработки.

---

## Главный принцип

**MVP — это не маленькая версия всего. Это узкая полоса, которая
приносит деньги и доказывает бизнес-модель.**

В MVP входит: Auth → Catalog → Upload → Moderation → Payment →
License → MTA integration → Updates + Rollback.

**НЕ входит в MVP (отложено):** subscriptions, биржа заказов, чаты,
bundle, промокоды, A/B, seller API, инфлюенсер-система, Live Demo,
3D Asset Studio, Leak Radar, депозиты.

---

## STAGE 0 — DRM Feasibility Spike (1–3 дня) ⭐ критично

До всей остальной разработки доказываем главную гипотезу:

```
encrypted test.lua → C++ module → AES-GCM decrypt →
Lua execution → ресурс нормально работает
```

Проверить: Windows + Linux, MTA 1.6.x. Ответить на вопрос:
*«MTA позволяет нашему модулю вмешаться в lifecycle загрузки ресурса
так, как нам нужно?»* (MTA грузит ресурсы через внутренний
loader/`LuaLoadBuffer`; модуль — это `<module>` в mtaserver.conf, и
автоматического "защищённого resource loader" из этого не следует.)

- ✅ Spike успешен → начинаем Stage 1
- ❌ Spike провален → пересмотр всей концепции ДО разработки площадки

## STAGE 1 — Фундамент (неделя 1)

```
□ Скет монорепозитория (apps/web, apps/server, infra/)
□ docker-compose: PostgreSQL + Redis + MinIO
□ CI: lint + unit + integration при каждом push
□ Миграции БД (07_База_данных.md, без orders/subscriptions)
□ CI/CD pipeline: build → migrate check → deploy staging → smoke
```

## STAGE 2 — Auth + Users (неделя 2)

```
□ Регистрация/логин/JWT/refresh (rotation + reuse detection)
□ Верификация email (SMTP)
□ Роли + permissions (см. RBAC в 10_Безопасность.md)
□ Сессии: таблица devices, logout all
```

## STAGE 3 — Catalog + Upload + Moderation (недели 3–4)

```
□ CRUD ресурсов продавцом (draft → submitted → under_review → approved → published)
□ Модерация: moderation_reason, moderator_id, reviewed_at
□ FTS-поиск (search_vector + GIN)
□ Upload pipeline: статическая валидация → публикация
□ ⚠️ Динамический smoke-тест — В ЭФЕМЕРНОМ SANDBOX (см. 10_Безопасность)
```

## STAGE 4 — Payments (неделя 5)

```
□ ЮKassa: выбрать модель — Safe Deal ИЛИ Split Payments (см. 06_Платежка)
□ Webhook-обработка (idempotent)
□ Финансовый ledger + invariant tests
□ Комиссия площадки
```

## STAGE 5 — Purchase + Licenses (неделя 6)

```
□ Checkout → purchase (со snapshot'ом) → license
□ Financial ledger: seller_pending и т.д.
□ License Server: /v1/activate, /v1/verify (lease-модель)
□ Installation keys, challenge/response
```

## STAGE 6 — MTA Module (недели 7–8)

```
□ Market Manager: расшифровка blob, lease renew, license_check()
□ Grace/controlled-state логика
□ End-to-end сборка Windows + Linux
```

## STAGE 7 — Real-world test + Closed Beta (недели 9–10)

```
□ Полный путь руками: seller → upload → moderation → buyer → pay →
  install → run → update → rollback
□ Инвариантные тесты зелёные (11_Тестирование.md)
□ Закрытая бета: 5–10 продавцов, 20–50 покупателей
□ Только после этого: public launch
```

## POST-MVP (по приоритету, после закрытой беты)

```
1. Live Demo (sandbox-ферма демо-серверов)
2. Аналитика продавцам (агрегаты!)
3. Leak Radar (forensic scoring)
4. Subscriptions (renewal, proration — большая логика)
5. 3D Asset Studio
6. Биржа заказов (второй продукт!)
7. Промокоды, bundle, инфлюенсер-система, seller API
```

---

## Правила работы над roadmap

1. **Scope-based, не calendar-based:** stage завершён, когда выполнены
   его критерии приёмки, а не «прошла неделя».
2. Не браться за Stage N+1, пока N не работает end-to-end.
3. Всё «хочется, но потом» → POST-MVP. Список — не договор, а
   приоритизация.
4. Каждый перенос/изменение — фиксировать в 13_Решения.md.
5. Пустой чекбокс продакшен-фазы = блокер запуска.
