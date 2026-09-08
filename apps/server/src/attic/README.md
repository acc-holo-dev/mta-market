# Attic

Код, временно исключённый из компиляции до соответствующей фазы плана PLAN.md.
Ничего из этого не импортируется рантаймом; файлы сохранены как исторический
материал для соответствующих фаз.

## order.ts.phase-c — Phase C (C-012)

Стаб корзины/заказов (`Order`, `OrderItem`), написанный против моделей, которые
никогда не существовали в скомпилированном контракте. Не импортировался ни одним
роутом. Возвращается в `src/lib/` в Phase C, когда контракт получит модели
`Order`/`OrderItem` и будет переписан под `db.orm` API.

## signing.ts.phase-b — Phase B (B-002)

Artifact signing service (TASK-019). Написан против классического Prisma Client
API (`findFirst`/`findUnique`/`include`), которого нет в этом проекте — здесь
`db.orm.public.*` контрактный ORM. Никем не импортирован. В Phase B подключается
к publication pipeline с переписыванием на контрактный API.

## providers/ — Phase E (E-002)

Дублирующая абстракция платёжных провайдеров (`yookassa.ts`, `discord.ts`),
импортировавшая несуществующие пути `./paymentProvider`, `./yookassaWebhook`.
Канонические реализации остались на месте: `lib/yookassa.ts`,
`lib/yookassaWebhook.ts`, `lib/paymentProvider.ts` (интерфейс), а identity-провайдер —
`lib/identityProvider.ts`. По E-002 выбирается одна каноническая реализация;
дубликаты не должны вернуть в `src/lib/` без консолидации.

## sandbox/ — Phase B (B-001)

Upload sandbox (TASK-022: static.ts, runner.ts, service.ts, types.ts).
Реализация существует, но не подключена к publication pipeline (это и есть
задача B-001) и написана против классического Prisma API + зависимость
`unzipper` отсутствует в package.json. Никем не импортирован. В Phase B
подключается к `version upload -> validation -> sandbox -> artifact` с
переписыванием на контрактный ORM.

## cli-artifact.ts.phase-b — Phase B (B-002)

CLI artifact signing (`pnpm artifact:*`), зависел от `lib/artifact/signing.ts`
(см. выше). Возвращается вместе с signing service.