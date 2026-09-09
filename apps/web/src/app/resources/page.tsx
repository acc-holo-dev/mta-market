"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchResources, formatRub, type Resource, type Pagination } from "@/lib/api-ext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Package } from "lucide-react";

const PAGE_SIZE = 12;

export default function ResourcesPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["resources", page],
    queryFn: () => fetchResources(page, PAGE_SIZE),
  });

  const resources: Resource[] = data?.data ?? [];
  const pagination: Pagination | undefined = data?.pagination;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full mt-2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Ошибка загрузки</CardTitle>
            <CardDescription>Не удалось загрузить ресурсы. Попробуйте позже.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Каталог ресурсов</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Серверные ресурсы для MTA:SA с DRM-защитой
        </p>
      </div>

      {resources.length === 0 ? (
        <div className="text-center py-16">
          <Package className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Пока нет опубликованных ресурсов</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((resource) => (
            <Link key={resource.id} href={`/resources/${resource.slug}`} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {resource.title}
                    </CardTitle>
                    <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded flex-shrink-0">
                      {resource.type}
                    </span>
                  </div>
                  <CardDescription className="line-clamp-3">{resource.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  {resource.price === 0 ? (
                    <StatusBadge status="FREE">БЕСПЛАТНО</StatusBadge>
                  ) : (
                    <span className="text-lg font-bold">{formatRub(resource.price)}</span>
                  )}
                  <Button variant="ghost" size="sm">
                    Подробнее
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 ? (
        <div className="flex items-center justify-center gap-4 mt-10">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </Button>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Страница {pagination.page} из {pagination.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд
          </Button>
        </div>
      ) : null}
    </div>
  );
}
