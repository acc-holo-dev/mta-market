"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { bootstrapSession } from "@/lib/api";
import { fetchMyPurchases, formatRub, type Purchase } from "@/lib/api-ext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DisputeDialog } from "@/components/disputes/DisputeDialog";
import { ShoppingBag, Scale } from "lucide-react";

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

  const { data: purchases, isLoading } = useQuery({
    queryKey: ["purchases", "my", "account"],
    queryFn: fetchMyPurchases,
    enabled: accessToken !== null,
  });

  if (!isAuthenticated()) return null;

  const list = (purchases as Purchase[] | undefined) ?? [];

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">Личный кабинет</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">Ваши покупки и лицензии</p>
        </div>
        <Link href="/disputes">
          <Button variant="outline">
            <Scale className="mr-2 h-4 w-4" />
            Мои споры
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Мои покупки</CardTitle>
          <CardDescription>Лицензии выдаются после подтверждения оплаты</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Загрузка...</p>
          ) : list.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">У вас пока нет покупок</p>
              <Link href="/resources">
                <Button variant="primary" size="sm" className="mt-4">
                  В каталог
                </Button>
              </Link>
            </div>
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
                      <StatusBadge status={p.status}>{p.status}</StatusBadge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {p.license ? (
                        <>
                          Лицензия: <StatusBadge status={p.license.status}>{p.license.status}</StatusBadge>
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
