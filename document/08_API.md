# 🔌 API — все эндпоинты

> REST API Backend. Формат: JSON через HTTPS.
> Авторизация: `Authorization: Bearer <JWT>` (кроме публичных).

---

## 1. Формат ответа (единый на всю систему)

**Успех:**

```json
{ "data": { ... } }
```

**Ошибка:**

```json
{ "error": { "code": "LICENSE_EXPIRED", "message": "Лицензия истекла" } }
```

**Коды HTTP:** 200 OK, 201 Created, 400 (ошибка запроса), 401 (нет токена),
403 (нет прав), 404 (не найдено), 409 (конфликт: например, HWID занят),
429 (rate limit), 500 (ошибка сервера).

---

## 2. Auth — аутентификация

| Метод | Путь                           | Описание                                |
| ----- | ------------------------------ | --------------------------------------- |
| POST  | `/api/v1/auth/register`        | Регистрация (email, password, nickname) |
| POST  | `/api/v1/auth/login`           | Вход → `{accessToken, refreshToken}`    |
| POST  | `/api/v1/auth/refresh`         | Обновить access token                   |
| POST  | `/api/v1/auth/forgot-password` | Прислать ссылку на сброс                |
| GET   | `/api/v1/auth/me`              | Профиль текущего пользователя           |

## 3. Catalog — каталог

| Метод | Путь                                           | Описание                   |
| ----- | ---------------------------------------------- | -------------------------- |
| GET   | `/api/v1/catalog?page=1&category=...&sort=new` | Список товаров (пагинация) |
| GET   | `/api/v1/catalog/:slug`                        | Карточка товара            |
| GET   | `/api/v1/catalog/:slug/reviews`                | Отзывы к товару            |

## 4. Seller — кабинет продавца

| Метод | Путь                                    | Описание                      |
| ----- | --------------------------------------- | ----------------------------- |
| POST  | `/api/v1/seller/resources`              | Создать ресурс (draft)        |
| POST  | `/api/v1/seller/resources/:id/versions` | Загрузить новую версию (blob) |
| POST  | `/api/v1/seller/resources/:id/publish`  | Отправить на публикацию       |
| GET   | `/api/v1/seller/stats`                  | Аналитика продаж              |

## 5. Payments — платежи

| Метод | Путь                            | Описание                                    |
| ----- | ------------------------------- | ------------------------------------------- |
| POST  | `/api/v1/payments/checkout`     | Создать платёж → URL ЮKassa                 |
| POST  | `/api/v1/webhooks/yookassa`     | Webhook от ЮKassa (без JWT, подпись ЮKassa) |
| POST  | `/api/v1/purchases/:id/confirm` | Покупатель подтверждает escrow              |
| POST  | `/api/v1/purchases/:id/dispute` | Открыть спор                                |

## 6. Licenses — лицензии (кабинет покупателя)

| Метод | Путь                                    | Описание                                    |
| ----- | --------------------------------------- | ------------------------------------------- |
| GET   | `/api/v1/me/licenses`                   | Мои лицензии                                |
| GET   | `/api/v1/me/licenses/:id/installations` | Установки лицензии (license_installations)  |
| POST  | `/api/v1/me/installations/:id/revoke`   | Отвязать установку самим покупателем        |
| POST  | `/api/v1/me/resources/:id/updates`      | Обновить ресурс (+ получить rollback-token) |
| POST  | `/api/v1/me/resources/:id/rollback`     | Откат на предыдущую версию                  |

## 6b. Модерация и споры (было неполно, по итогам аудита)

| Метод    | Путь                                  | Описание                           |
| -------- | ------------------------------------- | ---------------------------------- |
| POST     | `/api/v1/admin/resources/:id/approve` | Модерация: одобрить                |
| POST     | `/api/v1/admin/resources/:id/reject`  | Модерация: отклонить (с reason)    |
| GET/POST | `/api/v1/disputes`                    | Lifecycle споров (open → resolved) |
| GET      | `/api/v1/admin/reconciliation`        | Сверка платежей провайдера (daily) |
| GET      | `/api/v1/me/sessions`                 | Список активных сессий устройства  |
| POST     | `/api/v1/me/sessions/logout_all`      | Выйти со всех устройств            |

## 7. License Server — API для DRM-модуля (отдельный контекст!)

**Важно:** эти эндпоинты вызывает C++ модуль, а не Frontend.
Авторизация — installation keypair (challenge/response), не JWT.
Rate limit: строго.

| Метод | Путь           | Описание                                                         |
| ----- | -------------- | ---------------------------------------------------------------- |
| POST  | `/v1/activate` | Первый запуск: регистрация installation pubkey                   |
| POST  | `/v1/verify`   | Renew lease: challenge/response + обновление подписанного токена |
| POST  | `/v1/report`   | Телеметрия (версия MTA, ОС — aggregate only)                     |

**Пример `/v1/verify` (запрос):**

```json
{
  "installation_id": "inst_9f2b",
  "challenge_sig": "base64(ed25519_sign(nonce, ts))",
  "nonce": "8c2f...",
  "resources": ["aircraft_system"]
}
```

**Ответ** — подписан Ed25519, содержит `key_id` (ротация):

```json
{
  "key_id": 3,
  "status": "active",
  "nonce": "8c2f...",
  "lease_expires_at": "2026-02-04T12:00:05Z",
  "deks": { "aircraft_system": "base64(wrapped_DEK)" },
  "ts": "2026-02-03T12:00:05Z",
  "sig": "base64(ed25519_signature)"
}
```

## 8. Admin — админ-панель

| Метод | Путь                                 | Описание                       |
| ----- | ------------------------------------ | ------------------------------ |
| GET   | `/api/v1/admin/licenses`             | Все лицензии (фильтры)         |
| POST  | `/api/v1/admin/licenses/:id/revoke`  | Отозвать лицензию              |
| GET   | `/api/v1/admin/disputes`             | Споры в очереди                |
| POST  | `/api/v1/admin/disputes/:id/resolve` | Решить спор (refund / выплата) |

## 9. Правила API

1. **Версионирование:** всё под `/v1/`. Ломающие изменения = `/v2/`.
2. **Rate limits:** публичные 60 req/мин/IP, `/v1/verify` — 10 req/мин.
3. **Все мутирующие запросы** пишутся в `audit_log`.
4. **Idempotency-Key** обязателен в `payments/checkout` (защита от двойной оплаты).
5. Ошибки всегда с `code` — фронтенд показывает сообщение по коду.

---

## 10. Формальная терминология домена (по итогам аудита) ⭐

Термины, которые раньше использовались как синонимы — теперь строго
разведены (см. подробнее в 16_Модель_домена.md):

| Термин           | Значение                                                                  |
| ---------------- | ------------------------------------------------------------------------- |
| **Order**        | Корзина/заказ покупателя (до оплаты) — _в MVP: одна покупка = один order_ |
| **Payment**      | Финансовая транзакция через провайдера                                    |
| **Purchase**     | Право на товар после успешного payment (со snapshot'ом)                   |
| **License**      | Право эксплуатации ресурса (выдаётся из purchase)                         |
| **Installation** | Конкретная установка с keypair (у лицензии их N)                          |
| **Lease**        | Подписанный токен на 24ч, продлевается модулем                            |
| **Payout**       | Выплата продавцу (после escrow-подтверждения)                             |
| **Dispute**      | Спор по purchase'у                                                        |

Отложено из MVP (эндпоинты удалятся): `orders/bids` (биржа заказов —
второй продукт), подписки.
