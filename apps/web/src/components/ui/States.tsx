// Shared loading / empty / error states (PLAN-001 J-003).
"use client";

import { Button } from "@/components/ui/Button";
import { getErrorMessage } from "@/lib/api-ext";
import { Inbox, Loader2 } from "lucide-react";

export function LoadingSpinner({ label = "Загрузка...", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-12 text-slate-500 dark:text-slate-400 ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  title = "Ничего не найдено",
  description,
  action,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-center py-12 ${className}`}>
      <Inbox className="h-12 w-12 text-slate-400 mx-auto mb-4" />
      <p className="text-slate-700 dark:text-slate-300 font-medium">{title}</p>
      {description ? <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className = "",
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`py-10 text-center ${className}`}
      role="alert"
    >
      <p className="text-red-600 dark:text-red-400 font-medium">Ошибка загрузки</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        {getErrorMessage(error, "Не удалось загрузить данные. Попробуйте позже.")}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}
