// Admin (PLAN-002 I-001..I-006): control center — дашборд со статистикой,
// очередь модерации, заявки продавцов, споры, отзыв версий.
// Существующий backend/admin функционал сохранён, presentation переработана.
"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminStats,
  fetchAdminResources,
  adminSetResourceStatus,
  fetchModerationEvents,
  fetchAdminSellers,
  adminSellerAction,
  fetchAdminDisputes,
  adminTransitionDispute,
  fetchDispute,
  postDisputeMessage,
  adminYankVersion,
  adminVersionCompatibility,
  getErrorMessage,
  type Resource,
  type Dispute,
} from "@/lib/api-ext";
import { useAuthStore } from "@/store/auth";
import { bootstrapSession } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge, statusLabel } from "@/components/ui/StatusBadge";
import { MessageThread } from "@/components/MessageThread";
import { LoadingSpinner, EmptyState } from "@/components/ui/States";
import { typeLabel, formatDate } from "@/lib/domain";
import { Shield, Gavel, Users, Ban, Inbox } from "lucide-react";

type Tab = "moderation" | "sellers" | "disputes" | "versions";

export default function AdminPage() {
  const { user, isAuthenticated } = useAuthStore();
  const [tab, setTab] = useState<Tab>("moderation");
  const [booted, setBooted] = useState(false);

  // G-001/G-002: the access token is memory-only, so a direct visit to
  // /admin (fresh load or reload) must restore the session from the refresh
  // cookie BEFORE the role check, otherwise an admin sees "access denied".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await bootstrapSession();
      if (!cancelled) setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!booted) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <LoadingSpinner label="Загрузка админ-панели..." />
      </div>
    );
  }

  if (!isAuthenticated() || !user || (user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Card className="mx-auto max-w-md text-center">
          <CardContent className="py-10 space-y-3">
            <Shield className="h-10 w-10 text-bad mx-auto" />
            <CardTitle className="text-bad">Доступ запрещён</CardTitle>
            <CardDescription>Раздел доступен только администраторам и модераторам.</CardDescription>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Shield className="h-7 w-7 text-accent" /> Панель управления
        </h1>
        <p className="mt-1 text-content-secondary">
          Модерация ресурсов, продавцы, споры и версии
        </p>
      </div>

      <StatsCards />

      <Tabs
        className="my-6"
        value={tab}
        onChange={setTab}
        tabs={[
          ["moderation", "Модерация ресурсов"],
          ["sellers", "Продавцы"],
          ["disputes", "Споры"],
          ["versions", "Версии"],
        ]}
      />

      {tab === "moderation" ? <ModerationSection /> : null}
      {tab === "sellers" ? <SellersSection /> : null}
      {tab === "disputes" ? <DisputesSection /> : null}
      {tab === "versions" ? <VersionsSection /> : null}
    </div>
  );
}

// ---------- Dashboard (I-002) ----------
function StatsCards() {
  const { data } = useQuery({ queryKey: ["admin-stats"], queryFn: fetchAdminStats });

  const cards: { label: string; value: string | number; accent?: boolean }[] = [
    { label: "Пользователи", value: data?.users.total ?? "—" },
    { label: "Активные", value: data?.users.active ?? "—" },
    { label: "Забанены", value: data?.users.banned ?? "—" },
    { label: "Ресурсы", value: data?.resources.total ?? "—" },
    { label: "Опубликованы", value: data?.resources.published ?? "—" },
    { label: "На модерации", value: data?.resources.pendingReview ?? "—", accent: true },
    { label: "Отзывы", value: data?.reviews.total ?? "—" },
    {
      label: "Средняя оценка",
      value: data?.reviews.averageRating != null ? data.reviews.averageRating.toFixed(1) : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className={c.accent ? "border-accent/40" : undefined}>
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-content-secondary">{c.label}</p>
            <div className="text-2xl font-bold mt-1">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- Moderation queue (I-003/I-004/I-005) ----------
function ModerationSection() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [eventsFor, setEventsFor] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-resources", "PENDING_REVIEW"],
    queryFn: () => fetchAdminResources("PENDING_REVIEW", 1),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      adminSetResourceStatus(id, status, reason),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin-resources"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["moderation-events"] });
    },
    onError: (e) => setError(getErrorMessage(e, "Не удалось изменить статус")),
  });

  const list: Resource[] = data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Очередь модерации</CardTitle>
        <CardDescription>Ресурсы, ожидающие решения</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-bad">{error}</p> : null}
        {isLoading ? (
          <LoadingSpinner label="Загрузка очереди..." />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-12 w-12 text-content-muted mx-auto mb-4" />}
            title="Очередь пуста."
            description="Все отправленные ресурсы обработаны"
          />
        ) : (
          list.map((r) => (
            <div
              key={r.id}
              className="p-4 rounded-card border border-line bg-surface-raised space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-sm text-content-secondary">
                    {typeLabel(r.type)}{" "}
                    <span className="font-mono text-[11px] text-content-muted">
                      {r.type}
                    </span>{" "}
                    · /{r.slug} ·{" "}
                    {r.price === 0 ? "бесплатно" : "платный"} · отправлен{" "}
                    {formatDate(r.createdAt)}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <Input
                value={reasons[r.id] ?? ""}
                onChange={(e) => setReasons((m) => ({ ...m, [r.id]: e.target.value }))}
                placeholder="Причина (для отклонения)"
                aria-label={`Причина отклонения для ${r.title}`}
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ id: r.id, status: "PUBLISHED" })}
                >
                  Опубликовать
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({
                      id: r.id,
                      status: "SUSPENDED",
                      reason: reasons[r.id] || "Отклонено модератором",
                    })
                  }
                >
                  Отклонить
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEventsFor(eventsFor === r.id ? null : r.id)}
                >
                  История модерации
                </Button>
              </div>
              {eventsFor === r.id ? <ModerationEvents resourceId={r.id} /> : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ModerationEvents({ resourceId }: { resourceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["moderation-events", resourceId],
    queryFn: () => fetchModerationEvents(resourceId),
  });

  if (isLoading) return <LoadingSpinner label="Загрузка истории..." className="py-6" />;

  const list = (Array.isArray(data) ? data : ((data as { data?: unknown[] })?.data ?? [])) as {
    fromStatus?: string;
    toStatus?: string;
    reason?: string | null;
    createdAt?: string;
    actorId?: string;
  }[];

  return (
    <div className="p-3 rounded-md bg-surface text-sm">
      <p className="text-xs font-medium mb-2 text-content-secondary">События модерации</p>
      {list.length === 0 ? (
        <p className="text-xs text-content-muted">Событий нет.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((ev, i) => (
            <li key={i} className="text-xs text-content-secondary">
              {ev.createdAt ? formatDate(ev.createdAt) : "—"}:{" "}
              <StatusBadge status={ev.toStatus ?? "UNKNOWN"} />{" "}
              {ev.reason ? <span className="text-content-muted">— {ev.reason}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Seller approvals (I-006) ----------
interface SellerRow {
  id: string;
  userId: string;
  status: string;
  displayName?: string | null;
  user?: { username?: string; email?: string };
}

function SellersSection() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-sellers", "PENDING"],
    queryFn: () => fetchAdminSellers("PENDING"),
  });

  const action = useMutation({
    mutationFn: ({ userId, act }: { userId: string; act: "approve" | "reject" }) =>
      adminSellerAction(userId, act, act === "reject" ? reason || "Отклонено" : undefined),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin-sellers"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (e) => setError(getErrorMessage(e, "Действие не выполнено")),
  });

  const list = (Array.isArray(data) ? data : ((data as { data?: unknown[] })?.data ?? [])) as SellerRow[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" /> Заявки продавцов
        </CardTitle>
        <CardDescription>Ожидают одобрения</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-bad">{error}</p> : null}
        {isLoading ? (
          <LoadingSpinner label="Загрузка заявок..." />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12 text-content-muted mx-auto mb-4" />}
            title="Нет заявок"
            description="Новые заявки на статус продавца появятся здесь"
          />
        ) : (
          <>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина отклонения (необязательно)"
              aria-label="Причина отклонения"
            />
            {list.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-start justify-between gap-3 p-4 rounded-card border border-line bg-surface-raised"
              >
                <div>
                  <p className="font-medium">{s.displayName || s.user?.username || s.userId}</p>
                  <p className="text-xs text-content-muted">{s.user?.email ?? s.userId}</p>
                  <p className="text-[11px] font-mono text-content-muted/70">{s.userId}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ userId: s.userId, act: "approve" })}
                  >
                    Одобрить
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ userId: s.userId, act: "reject" })}
                  >
                    Отклонить
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Disputes ----------
const DISPUTE_TRANSITIONS: [string, string][] = [
  ["UNDER_REVIEW", "На рассмотрении"],
  ["RESOLVED_BUYER", "Решён в пользу покупателя"],
  ["RESOLVED_SELLER", "Решён в пользу продавца"],
  ["PARTIAL_REFUND", "Частичный возврат"],
  ["CLOSED", "Закрыт"],
];

function DisputesSection() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-disputes"],
    queryFn: () => fetchAdminDisputes(),
  });

  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminTransitionDispute(id, status),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin-disputes"] });
    },
    onError: (e) => setError(getErrorMessage(e, "Не удалось изменить статус спора")),
  });

  const list: Dispute[] = data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-accent" /> Споры
        </CardTitle>
        <CardDescription>Все споры и переходы статусов</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-bad">{error}</p> : null}
        {isLoading ? (
          <LoadingSpinner label="Загрузка споров..." />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Gavel className="h-12 w-12 text-content-muted mx-auto mb-4" />}
            title="Споров нет"
            description="Открытые споры покупателей появятся здесь"
          />
        ) : (
          list.map((d) => (
            <div
              key={d.id}
              className="p-4 rounded-card border border-line bg-surface-raised space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    Спор #{d.id.slice(0, 8)} · {d.targetType === "PURCHASE" ? "Покупка" : "Услуга"}
                  </p>
                  <p className="text-xs text-content-muted">
                    {new Date(d.createdAt).toLocaleString("ru-RU")}
                  </p>
                  <p className="text-sm text-content-secondary mt-1">{d.reason}</p>
                </div>
                <StatusBadge status={d.status} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {DISPUTE_TRANSITIONS.filter(([t]) => t !== d.status).map(([t, label]) => (
                  <Button
                    key={t}
                    variant="outline"
                    size="sm"
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ id: d.id, status: t })}
                  >
                    {label}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setOpen(open === d.id ? null : d.id)}>
                  Переписка
                </Button>
              </div>
              {open === d.id ? <AdminDisputeMessages disputeId={d.id} /> : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AdminDisputeMessages({ disputeId }: { disputeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dispute", disputeId],
    queryFn: () => fetchDispute(disputeId),
  });

  if (isLoading) return <LoadingSpinner label="Загрузка переписки..." className="py-6" />;
  if (!data) return <p className="text-sm text-bad">Не удалось загрузить переписку.</p>;

  return (
    <div className="p-3 rounded-md bg-surface">
      <MessageThread
        messageIdPrefix="dispute"
        messages={data.messages}
        sendFn={(body) => postDisputeMessage(disputeId, body)}
      />
    </div>
  );
}

// ---------- Versions (yank) ----------
function VersionsSection() {
  const [versionId, setVersionId] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const yank = useMutation({
    mutationFn: () => adminYankVersion(versionId.trim(), reason.trim() || "Отозвано админом"),
    onSuccess: () => {
      setResult("Версия отозвана (yank)");
      setError(null);
    },
    onError: (e) => {
      setResult(null);
      setError(getErrorMessage(e, "Не удалось отозвать версию"));
    },
  });

  const compat = useMutation({
    mutationFn: () => adminVersionCompatibility(versionId.trim()),
    onSuccess: (data) => {
      setResult(JSON.stringify(data, null, 2));
      setError(null);
    },
    onError: (e) => {
      setResult(null);
      setError(getErrorMessage(e, "Не удалось получить совместимость"));
    },
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5 text-bad" /> Отзыв версии (yank)
        </CardTitle>
        <CardDescription>Укажите ID версии и причину</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          placeholder="ID версии"
          aria-label="ID версии"
        />
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Причина отзыва"
          aria-label="Причина отзыва"
        />
        <div className="flex gap-2">
          <Button
            variant="danger"
            size="sm"
            disabled={!versionId.trim() || yank.isPending}
            onClick={() => yank.mutate()}
          >
            Отозвать версию
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!versionId.trim() || compat.isPending}
            onClick={() => compat.mutate()}
          >
            Проверить совместимость
          </Button>
        </div>
        {result ? (
          <pre className="text-xs bg-surface-raised border border-line p-3 rounded-md overflow-x-auto text-content-secondary">
            {result}
          </pre>
        ) : null}
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
