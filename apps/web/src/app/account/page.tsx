// Account: profile + balance + linked identities + purchases (B-002, C-004).
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { bootstrapSession } from "@/lib/api";
import {
  fetchMyPurchases,
  fetchMe,
  fetchIdentities,
  patchProfile,
  formatRub,
  getErrorMessage,
  type Purchase,
} from "@/lib/api-ext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge, ErrorText } from "@/components/ui/StatusBadge";
import { LoadingSpinner, EmptyState, ErrorState } from "@/components/ui/States";
import { DisputeDialog } from "@/components/disputes/DisputeDialog";
import { Scale, Wallet, User as UserIcon, Link2, Pencil, Check, X } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  USER: "Покупатель",
  SELLER: "Продавец",
  MODERATOR: "Модератор",
  ADMIN: "Администратор",
};

export default function AccountPage() {
  const router = useRouter();
  const { accessToken, isAuthenticated } = useAuthStore();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await bootstrapSession();
      if (!cancelled && !ok) router.push("/auth/login");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const { data: me, isLoading: meLoading, error: meError, refetch: refetchMe } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: accessToken !== null,
    staleTime: 10_000,
  });

  const {
    data: purchases,
    isLoading: purchasesLoading,
    error: purchasesError,
    refetch: refetchPurchases,
  } = useQuery({
    queryKey: ["purchases", "my", "account"],
    queryFn: fetchMyPurchases,
    enabled: accessToken !== null,
  });

  const { data: identities } = useQuery({
    queryKey: ["identities"],
    queryFn: fetchIdentities,
    enabled: accessToken !== null,
    retry: false,
  });

  if (!isAuthenticated()) return null;

  const list = (purchases as Purchase[] | undefined) ?? [];

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">Профиль</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Ваш аккаунт, баланс, покупки и лицензии
          </p>
        </div>
        <Link href="/disputes">
          <Button variant="outline">
            <Scale className="mr-2 h-4 w-4" />
            Мои споры
          </Button>
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-blue-600" /> Профиль
            </CardTitle>
            <CardDescription>Данные вашего аккаунта</CardDescription>
          </CardHeader>
          <CardContent>
            {meLoading ? (
              <LoadingSpinner />
            ) : meError ? (
              <ErrorState error={meError} onRetry={() => refetchMe()} />
            ) : me ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {me.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={me.avatar}
                      alt="Аватар"
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 text-xl font-bold">
                      {(me.displayName || me.username).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-lg">
                      {me.displayName || me.username}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {ROLE_LABELS[me.role] ?? me.role}
                    </p>
                  </div>
                </div>

                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400">Имя пользователя</dt>
                    <dd className="font-medium">{me.username}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                    <dd className="font-medium">{me.email}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400">Отображаемое имя</dt>
                    <dd className="font-medium">{me.displayName || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400">Роль</dt>
                    <dd className="font-medium">{ROLE_LABELS[me.role] ?? me.role}</dd>
                  </div>
                </dl>
                <p className="text-xs text-slate-400">
                  Имя пользователя, email и роль изменить нельзя.
                </p>

                <ProfileEditForm displayName={me.displayName ?? ""} avatar={me.avatar ?? ""} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Balance + identities */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-green-600" /> Баланс
              </CardTitle>
              <CardDescription>Средства для покупок на Маркетплейсе</CardDescription>
            </CardHeader>
            <CardContent>
              {meLoading ? (
                <LoadingSpinner />
              ) : me ? (
                <div className="space-y-2">
                  <div className="text-3xl font-bold">{formatRub(me.balance.available)}</div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Пополнение пока недоступно
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-blue-600" /> Связанные аккаунты
              </CardTitle>
              <CardDescription>Внешние провайдеры, привязанные к аккаунту</CardDescription>
            </CardHeader>
            <CardContent>
              {identities && identities.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {identities.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between p-2 border border-slate-200 dark:border-slate-700 rounded"
                    >
                      <span className="font-medium capitalize">{i.provider}</span>
                      <span className="text-slate-400 font-mono text-xs">
                        {i.providerAccountId.slice(0, 12)}…
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Внешние аккаунты не привязаны. Можно войти через Discord — он привяжется автоматически.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Purchases */}
      <Card>
        <CardHeader>
          <CardTitle>Мои покупки</CardTitle>
          <CardDescription>Лицензии выдаются после подтверждения оплаты</CardDescription>
        </CardHeader>
        <CardContent>
          {purchasesLoading ? (
            <LoadingSpinner />
          ) : purchasesError ? (
            <ErrorState error={purchasesError} onRetry={() => refetchPurchases()} />
          ) : list.length === 0 ? (
            <EmptyState
              title="У вас пока нет покупок"
              description="Выберите ресурс на Маркетплейсе"
              action={
                <Link href="/resources">
                  <Button variant="primary" size="sm">
                    На Маркетплейс
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {list.map((p) => (
                <div
                  key={p.id}
                  className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link
                        href={`/resources/${p.resource.slug}`}
                        className="font-semibold hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {p.resource.title}
                      </Link>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {p.resource.type} · {new Date(p.createdAt).toLocaleDateString("ru-RU")}
                        {p.version ? ` · v${p.version.version}` : ""}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-semibold">{formatRub(p.priceSnapshot)}</div>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {p.license ? (
                        <>
                          Лицензия: <StatusBadge status={p.license.status} />
                        </>
                      ) : (
                        <span className="text-slate-400">Лицензия не выдана</span>
                      )}
                    </div>
                    {p.status === "COMPLETED" ? (
                      <DisputeDialog targetType="PURCHASE" purchaseId={p.id} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- B-002: profile editing (displayName + avatar only) ----------
function ProfileEditForm({ displayName, avatar }: { displayName: string; avatar: string }) {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [avatarUrl, setAvatarUrl] = useState(avatar);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      patchProfile({
        ...(name !== displayName ? { displayName: name.trim() } : {}),
        ...(avatarUrl !== avatar ? { avatar: avatarUrl.trim() } : {}),
      }),
    onSuccess: async () => {
      setError(null);
      // Reload the profile so both the store and the balance stay in sync.
      const me = await fetchMe();
      setUser(me);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setError(getErrorMessage(e, "Не удалось сохранить профиль")),
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="mr-2 h-4 w-4" />
        Редактировать профиль
      </Button>
    );
  }

  return (
    <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
      <p className="text-sm font-medium">Редактирование профиля</p>
      <div>
        <label className="text-sm text-slate-600 dark:text-slate-400">Отображаемое имя</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Как вас видят другие"
          className="mt-1"
          disabled={mutation.isPending}
        />
      </div>
      <div>
        <label htmlFor="avatarUrl" className="text-sm text-slate-600 dark:text-slate-400">
          Ссылка на аватар
        </label>
        <Input
          id="avatarUrl"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://cdn.example.com/avatar.png"
          className="mt-1"
          disabled={mutation.isPending}
        />
      </div>
      {error ? <ErrorText message={error} /> : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={mutation.isPending || (name === displayName && avatarUrl === avatar)}
          onClick={() => mutation.mutate()}
        >
          <Check className="mr-1 h-4 w-4" />
          {mutation.isPending ? "Сохранение..." : "Сохранить"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            setOpen(false);
            setName(displayName);
            setAvatarUrl(avatar);
            setError(null);
          }}
        >
          <X className="mr-1 h-4 w-4" />
          Отмена
        </Button>
      </div>
    </div>
  );
}
