// Доменные подписи и мелкие форматтеры (PLAN-002 M-002: единая терминология).
export const TYPE_LABELS: Record<string, string> = {
  SCRIPT: "Скрипт",
  MAP: "Карта",
  MODEL: "Модель",
  TEXTURE: "Текстура",
  SOUND: "Звук",
  GAMEMODE: "Гейммод",
  CUSTOM_SCRIPT: "Кастомный скрипт",
};

export const TYPE_LABELS_PLURAL: Record<string, string> = {
  SCRIPT: "Скрипты",
  MAP: "Карты",
  MODEL: "Модели",
  TEXTURE: "Текстуры",
  SOUND: "Звуки",
  GAMEMODE: "Гейммоды",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function typeLabelPlural(type: string): string {
  return TYPE_LABELS_PLURAL[type] ?? typeLabel(type);
}

/** 2024-01-05T... -> «5 янв. 2024» */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** PLAN-006 §43: относительное время для activity items («12 мин назад»). */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return formatDate(iso);
}
