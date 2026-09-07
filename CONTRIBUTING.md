# Contributing to MTA Market

Спасибо за интерес к проекту! Мы приветствуем любой вклад — от исправления опечаток до новых функций.

## 📋 Содержание

- [Code of Conduct](#code-of-conduct)
- [Как помочь](#как-помочь)
- [Процесс разработки](#процесс-разработки)
- [Правила коммитов](#правила-коммитов)
- [Стиль кода](#стиль-кода)
- [Тестирование](#тестирование)
- [Документация](#документация)

## Code of Conduct

Участвуя в проекте, вы соглашаетесь соблюдать наш [Code of Conduct](CODE_OF_CONDUCT.md).

Основные правила:

- Будьте уважительны к другим участникам
- Конструктивная критика приветствуется
- Недопустимы оскорбления, троллинг, домогательства
- Помогайте новичкам

## Как помочь

### 🐛 Нашли баг?

1. Проверьте [GitHub Issues](https://github.com/acc-holo-dev/mta-market/issues) — возможно, кто-то уже сообщил об этом
2. Если нет — создайте новый issue с подробным описанием:
   - Шаги для воспроизведения
   - Ожидаемое поведение
   - Фактическое поведение
   - Скриншоты (если применимо)
   - Версия Node.js, OS, браузера

### 💡 Есть идея?

1. Создайте issue с меткой `feature request`
2. Опишите:
   - Проблему, которую решает идея
   - Предлагаемое решение
   - Альтернативные варианты (если есть)
3. Дождитесь обсуждения перед началом работы

### 📝 Документация

- Исправления опечаток
- Улучшение существующей документации
- Добавление примеров использования
- Перевод на другие языки

### 🧑‍💻 Хотите написать код?

Ищите issues с метками:

- `good first issue` — для новичков
- `help wanted` — нужна помощь
- `bug` — исправление багов
- `enhancement` — новые функции

## Процесс разработки

### 1. Fork & Clone

```bash
# Fork репозиторий через GitHub UI

# Клонировать ваш fork
git clone https://github.com/YOUR_USERNAME/mta-market.git
cd mta-market

# Добавить upstream
git remote add upstream https://github.com/acc-holo-dev/mta-market.git
```

### 2. Создать ветку

```bash
# Обновить main
git checkout main
git pull upstream main

# Создать feature branch
git checkout -b feature/my-awesome-feature

# Или для bugfix
git checkout -b fix/issue-123
```

**Именование веток:**

- `feature/описание` — новая функция
- `fix/описание` — исправление бага
- `docs/описание` — документация
- `refactor/описание` — рефакторинг
- `test/описание` — тесты

### 3. Настроить окружение

```bash
# Установить зависимости
pnpm install

# Запустить PostgreSQL и Redis
docker-compose up -d postgres redis

# Настроить .env
cp .env.example .env
# Заполнить минимальные переменные

# Запустить dev серверы
# Backend
cd apps/server
pnpm dev

# Frontend (в другом терминале)
cd apps/web
pnpm dev
```

### 4. Внести изменения

- Пишите чистый, понятный код
- Следуйте существующему стилю
- Добавляйте комментарии для сложной логики
- Обновляйте документацию при необходимости

### 5. Тестирование

```bash
# Lint
pnpm lint

# Type check
pnpm type-check

# Build (проверить, что всё собирается)
pnpm build

# Tests (если есть)
pnpm test
```

### 6. Commit

```bash
git add .
git commit -m "feat: add user profile page"
```

**Формат коммита:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat` — новая функция
- `fix` — исправление бага
- `docs` — документация
- `style` — форматирование (без изменения кода)
- `refactor` — рефакторинг
- `test` — добавление тестов
- `chore` — обновление зависимостей, конфигурации

**Примеры:**

```
feat(auth): add Discord OAuth2 callback handler

- Implement token exchange
- Save user to database
- Generate JWT tokens

Closes #123
```

```
fix(payments): correct YooKassa webhook signature verification

The webhook signature was being verified incorrectly due to
wrong encoding. Now using base64 as per YooKassa docs.

Fixes #456
```

### 7. Push & Pull Request

```bash
# Push в ваш fork
git push origin feature/my-awesome-feature
```

Создайте Pull Request через GitHub UI:

1. Заполните описание (используйте template)
2. Укажите связанные issues (`Closes #123`)
3. Добавьте скриншоты (если UI изменения)
4. Дождитесь review

## Правила коммитов

### Формат

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Type (обязательно)

- `feat` — новая функция для пользователя
- `fix` — исправление бага
- `docs` — изменения в документации
- `style` — форматирование, отсутствующие точки с запятой и т.д.
- `refactor` — рефакторинг production кода
- `test` — добавление тестов
- `chore` — обновление задач сборки, настроек и т.д.

### Scope (опционально)

Модуль/компонент, которого касается изменение:

- `auth` — авторизация
- `payments` — платежи
- `drm` — DRM система
- `resources` — ресурсы
- `ui` — UI компоненты
- `api` — API endpoints
- `db` — база данных

### Subject (обязательно)

- Используйте императив: "add" не "added"
- Не ставьте точку в конце
- Максимум 50 символов
- Начинайте с маленькой буквы

### Body (опционально)

- Подробное описание изменений
- Объясните "что" и "почему", а не "как"
- Разделяйте пустой строкой от subject

### Footer (опционально)

- `Closes #123` — закрывает issue
- `Fixes #456` — исправляет баг
- `BREAKING CHANGE:` — breaking changes

### Примеры

**Хорошие:**

```
feat(auth): add password reset functionality
fix(api): correct rate limiting logic
docs(readme): update installation instructions
refactor(drm): simplify license verification
```

**Плохие:**

```
Fixed bug
Update
Changes
asdfasdf
```

## Стиль кода

### TypeScript

```typescript
// ✅ Хорошо
interface User {
  id: number;
  email: string;
  username: string;
}

async function createUser(data: User): Promise<User> {
  // Implementation
}

// ❌ Плохо
function createUser(data: any) {
  // Implementation
}
```

### React Components

```tsx
// ✅ Хорошо
interface ButtonProps {
  variant?: "primary" | "secondary";
  onClick?: () => void;
  children: React.ReactNode;
}

export function Button({ variant = "primary", onClick, children }: ButtonProps) {
  return (
    <button className={cn("btn", `btn-${variant}`)} onClick={onClick}>
      {children}
    </button>
  );
}

// ❌ Плохо
export function Button(props: any) {
  return <button {...props} />;
}
```

### Именование

- **Компоненты**: PascalCase (`UserProfile`)
- **Функции**: camelCase (`getUserById`)
- **Константы**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Типы/Интерфейсы**: PascalCase (`UserData`)
- **Файлы компонентов**: PascalCase (`Button.tsx`)
- **Файлы утилит**: camelCase (`formatDate.ts`)

### Импорты

```typescript
// Группировка импортов:
// 1. React/Next
import React from "react";
import { useRouter } from "next/navigation";

// 2. External libraries
import axios from "axios";
import { useQuery } from "@tanstack/react-query";

// 3. Internal modules
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth";
import api from "@/lib/api";

// 4. Types
import type { User } from "@/types";
```

### Комментарии

```typescript
// ✅ Хорошо — объясняет "почему"
// We need to debounce the search to avoid overwhelming the API
const debouncedSearch = useMemo(() => debounce(search, 300), []);

// ❌ Плохо — объясняет "что" (и так видно)
// Create a new user
const user = await createUser(data);
```

## Тестирование

Перед коммитом убедитесь, что:

```bash
# Lint проходит
pnpm lint

# Type check проходит
pnpm type-check

# Build успешен
pnpm build

# Tests (если есть) проходят
pnpm test
```

### Написание тестов

```typescript
// Example test (when tests are added)
describe("createUser", () => {
  it("should create a user with valid data", async () => {
    const data = {
      email: "test@example.com",
      username: "testuser",
    };

    const user = await createUser(data);

    expect(user).toBeDefined();
    expect(user.email).toBe(data.email);
  });

  it("should throw error with invalid email", async () => {
    const data = {
      email: "invalid-email",
      username: "testuser",
    };

    await expect(createUser(data)).rejects.toThrow();
  });
});
```

## Документация

### Code Comments

```typescript
/**
 * Creates a new purchase for the authenticated user.
 *
 * @param resourceSlug - The slug of the resource to purchase
 * @param versionId - Optional version ID (defaults to latest)
 * @returns The created purchase object
 * @throws {NotFoundError} If resource doesn't exist
 * @throws {UnauthorizedError} If user not authenticated
 */
async function createPurchase(resourceSlug: string, versionId?: number): Promise<Purchase> {
  // Implementation
}
```

### API Documentation

При добавлении новых endpoints — обновите документацию:

```markdown
## POST /api/resources

Create a new resource.

**Auth required:** Yes

**Request:**
\`\`\`json
{
"title": "My Script",
"description": "Description",
"type": "SCRIPT",
"price": 10000
}
\`\`\`

**Response (201):**
\`\`\`json
{
"id": 1,
"slug": "my-script",
"title": "My Script",
...
}
\`\`\`
```

## Pull Request Process

### Checklist

Перед созданием PR убедитесь:

- [ ] Код следует стилю проекта
- [ ] Все тесты проходят
- [ ] Lint/type check проходят
- [ ] Документация обновлена
- [ ] Коммиты осмысленные
- [ ] PR описание заполнено

### Review Process

1. Maintainer проверит PR
2. Могут быть запрошены изменения
3. После одобрения PR будет смержен
4. Изменения попадут в следующий релиз

## Вопросы?

- Создайте issue с меткой `question`
- Напишите на support@yourdomain.com
- Присоединяйтесь к Discord серверу

## Благодарности

Каждый contributor будет добавлен в список:

- В README.md
- В release notes
- На сайте (если будет)

Спасибо за ваш вклад! 🎉
