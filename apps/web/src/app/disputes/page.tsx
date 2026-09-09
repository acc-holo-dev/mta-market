"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchMyDisputes, type Dispute } from "@/lib/api-ext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Scale } from "lucide-react";

export default function DisputesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-disputes"],
    queryFn: fetchMyDisputes,
  });

  const list: Dispute[] = data?.data ?? [];

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Мои споры</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Споры по покупкам и заказам услуг
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Загрузка...</p>
      ) : error ? (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Ошибка загрузки</CardTitle>
          </CardHeader>
        </Card>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <Scale className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">У вас нет открытых споров</p>
          <Link href="/account">
            <Button variant="outline" size="sm" className="mt-4">
              К покупкам
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((d) => (
            <Link key={d.id} href={`/disputes/${d.id}`} className="block group">
              <Card className="transition-shadow group-hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">Спор #{d.id.slice(0, 8)}</CardTitle>
                      <CardDescription>
                        {d.targetType} · {new Date(d.createdAt).toLocaleDateString("ru-RU")}
                      </CardDescription>
                    </div>
                    <StatusBadge status={d.status}>{d.status}</StatusBadge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {d.reason}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
