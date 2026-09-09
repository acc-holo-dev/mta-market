"use client";

import { useState } from "react";
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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MessageThread } from "@/components/MessageThread";
import { Shield, Gavel, Users, Ban } from "lucide-react";

type Tab = "moderation" | "sellers" | "disputes" | "versions";

export default function AdminPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("moderation");

  if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Доступ запрещён</CardTitle>
            <CardDescription>Раздел доступен только администраторам и модераторам.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <Shield className="h-8 w-8 text-blue-600" /> Админ-панель
        </h1>
      </div>

      <StatsCards />

      <div className="flex gap-2 mb-6 flex-wrap">
        {(
          [
            ["moderation", "Модерация ресурсов"],
            ["sellers", "Продавцы"],
            ["disputes", "Споры"],
            ["versions", "Версии (yank)"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? "primary" : "outline"}
            size="sm"
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "moderation" ? <ModerationSection /> : null}
      {tab === "sellers" ? <SellersSection /> : null}
      {tab === "disputes" ? <DisputesSection /> : null}
      {tab === "versions" ? <VersionsSection /> : null}
    </div>
  );
}

// ---------- Stats ----------
function StatsCards() {
  const { data } = useQuery({ queryKey: ["admin-stats"], queryFn: fetchAdminStats });

  const cards: { label: string; value: string | number }[] = [
    { label: "Пользователи", value: data?.users.total ?? "—" },
    { label: "Активные", value: data?.users.active ?? "—" },
    { label: "Забанены", value: data?.users.banned ?? "—" },
    { label: "Ресурсы", value: data?.resources.total ?? "—" },
    { label: "Опубликованы", value: data?.resources.published ?? "—" },
    { label: "На модерации", value: data?.resources.pendingReview ?? "—" },
    { label: "Отзывы", value: data?.reviews.total ?? "—" },
    {
      label: "Средняя оценка",
      value: data?.reviews.averageRating != null ? data.reviews.averageRating.toFixed(1) : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-slate-500">{c.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- Moderation queue ----------
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
        <CardDescription>Ресурсы со статусом PENDING_REVIEW</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {isLoading ? (
          <p className="text-sm text-slate-500">Загрузка...</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-500">Очередь пуста.</p>
        ) : (
          list.map((r) => (
            <div
              key={r.id}
              className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-sm text-slate-500">
                    {r.type} · /{r.slug} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <Input
                value={reasons[r.id] ?? ""}
                onChange={(e) => setReasons((m) => ({ ...m, [r.id]: e.target.value }))}
                placeholder="Причина (для отклонения)"
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({ id: r.id, status: "PUBLISHED" })
                  }
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
                <Button variant="ghost" size="sm" onClick={() => setEventsFor(eventsFor === r.id ? null : r.id)}>
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

  if (isLoading) return <p className="text-sm text-slate-500">Загрузка истории...</p>;

  const list = Array.isArray(data) ? data : ((data as { data?: unknown[] })?.data ?? []);

  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
      <p className="text-xs font-medium mb-2">События модерации</p>
      {list.length === 0 ? (
        <p className="text-xs text-slate-500">Событий нет.</p>
      ) : (
        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          {list.map((ev, i) => (
            <li key={i} className="font-mono break-all">
              {JSON.stringify(ev)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Seller approvals ----------
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
          <Users className="h-5 w-5 text-blue-600" /> Заявки продавцов
        </CardTitle>
        <CardDescription>Ожидают одобрения (PENDING)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {isLoading ? (
          <p className="text-sm text-slate-500">Загрузка...</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-500">Нет заявок.</p>
        ) : (
          <>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина отклонения (необязательно)"
            />
            {list.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-4 p-3 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <div>
                  <p className="font-medium">{s.displayName || s.user?.username || s.userId}</p>
                  <p className="text-xs text-slate-500">
                    {s.user?.email ?? s.userId} · {s.status}
                  </p>
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
  const TRANSITIONS = ["UNDER_REVIEW", "RESOLVED_BUYER", "RESOLVED_SELLER", "PARTIAL_REFUND", "CLOSED"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-blue-600" /> Споры
        </CardTitle>
        <CardDescription>Все споры и переходы статусов</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {isLoading ? (
          <p className="text-sm text-slate-500">Загрузка...</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-500">Споров нет.</p>
        ) : (
          list.map((d) => (
            <div
              key={d.id}
              className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">
                    Спор #{d.id.slice(0, 8)} · {d.targetType}
                  </p>
                  <p className="text-sm text-slate-500">
                    {new Date(d.createdAt).toLocaleString("ru-RU")}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{d.reason}</p>
                </div>
                <StatusBadge status={d.status} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {TRANSITIONS.filter((t) => t !== d.status).map((t) => (
                  <Button
                    key={t}
                    variant="outline"
                    size="sm"
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ id: d.id, status: t })}
                  >
                    {t}
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

  if (isLoading) return <p className="text-sm text-slate-500">Загрузка переписки...</p>;
  if (!data) return <p className="text-sm text-red-600">Не удалось загрузить переписку.</p>;

  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5 text-red-600" /> Отзыв версии (yank)
        </CardTitle>
        <CardDescription>Укажите ID версии и причину</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          placeholder="ID версии"
        />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина отзыва" />
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
        {result ? <pre className="text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded overflow-x-auto">{result}</pre> : null}
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
