// Покупки (PLAN-002 G-004): история покупок + лицензии, без фиктивных
// показателей (M-001).
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { bootstrapSession } from "@/lib/api";
import { fetchMyPurchases, formatRub, type Purchase } from "@/lib/api-ext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner, EmptyState, ErrorState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import Link from "next/link";
import { Store, ShoppingBag } from "lucide-react";
import { typeLabel, formatDate } from "@/lib/domain";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Access token lives in memory only: after a page reload the store is
    // empty, so silently restore the session from the refresh cookie first.
    let cancelled = false;
    (async () => {
      const ok = await bootstrapSession();
      if (!cancelled && !ok) {
        router.push("/auth/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const {
    data: purchases,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["purchases", "my", "dashboard"],
    queryFn: fetchMyPurchases,
    enabled: isAuthenticated(),
  });

  if (!isAuthenticated() || !user) {
    return null;
  }

  const list = (purchases as Purchase[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Покупки</h1>
        <p className="mt-1 text-content-secondary">
          Привет, {user.displayName || user.username}! Здесь ваши приобретённые ресурсы и лицензии.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Мои покупки</CardTitle>
            <CardDescription>Ресурсы, лицензии и загрузки</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-content-muted">Загрузка покупок...</p>
            ) : error ? (
              <ErrorState error={error} onRetry={() => refetch()} />
            ) : list.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="h-12 w-12 text-content-muted mx-auto mb-4" />}
                title="У вас пока нет покупок"
                description="Выберите ресурс на Маркетплейсе — лицензия выдаётся сразу после оплаты"
                action={
                  <Link href="/resources">
                    <Button variant="primary" size="sm">
                      На Маркетплейс
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {list.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-card border border-line bg-surface-raised"
                  >
                    <div>
                      <Link
                        href={p.resource ? `/resources/${p.resource.slug}` : "/resources"}
                        className="font-semibold hover:text-accent-strong"
                      >
                        {p.resource?.title ?? "Ресурс недоступен"}
                      </Link>
                      <p className="text-sm text-content-secondary">
                        {typeLabel(p.resource.type ?? "")} · {formatDate(p.createdAt)}
                        {p.version ? ` · v${p.version.version}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold">{formatRub(p.priceSnapshot)}</div>
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Аккаунт</CardTitle>
            <CardDescription>Профиль, баланс и лицензии</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/account" className="block">
              <Button variant="outline" className="w-full" size="sm">
                Профиль и баланс
              </Button>
            </Link>
            <Link href="/seller" className="block">
              <Button variant="ghost" className="w-full" size="sm">
                <Store className="mr-2 h-4 w-4" />
                Мой магазин
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
