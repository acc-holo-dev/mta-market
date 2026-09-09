// Catalog / marketplace (D-002 filters + J-003 states).
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchResources, formatRub, type Resource } from "@/lib/api-ext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner, EmptyState, ErrorState } from "@/components/ui/States";

const PAGE_SIZE = 12;

// Server has no filter params for PLAN-001 — filtering is client-side on the
// fetched page of data.
type PriceFilter = "all" | "free" | "paid";
type TypeFilter = "ALL" | "SCRIPT" | "MAP" | "MODEL" | "TEXTURE" | "SOUND" | "GAMEMODE";

const TYPES: TypeFilter[] = ["SCRIPT", "MAP", "MODEL", "TEXTURE", "SOUND", "GAMEMODE"];

export default function ResourcesPage() {
  const [page, setPage] = useState(1);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL" as TypeFilter | "ALL");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["resources", page],
    queryFn: () => fetchResources(page, PAGE_SIZE),
  });

  const resources: Resource[] = data?.data ?? [];
  const pagination = data?.pagination;

  const filtered = useMemo(() => {
    return resources.filter((r) => {
      if (priceFilter === "free" && r.price !== 0) return false;
      if (priceFilter === "paid" && r.price === 0) return false;
      if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
      return true;
    });
  }, [resources, priceFilter, typeFilter]);

  const filtersActive = priceFilter !== "all" || typeFilter !== "ALL";

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Маркетплейс ресурсов</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Ресурсы для MTA:SA с DRM-защитой
        </p>
      </div>

      {/* Filters (D-002) */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="flex rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden">
          {(
            [
              ["all", "Все"],
              ["free", "Бесплатные"],
              ["paid", "Платные"],
            ] as [PriceFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPriceFilter(value)}
              className={`px-3 py-1.5 text-sm font-medium ${
                priceFilter === value
                  ? "bg-blue-600 text-white"
                  : "bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter | "ALL")}
          aria-label="Тип ресурса"
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          <option value="ALL">Все типы</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPriceFilter("all");
              setTypeFilter("ALL");
            }}
          >
            Сбросить фильтры
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingSpinner label="Загрузка ресурсов..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filtersActive ? "Ничего не найдено" : "Пока нет опубликованных ресурсов"}
          description={
            filtersActive
              ? "Попробуйте изменить или сбросить фильтры"
              : "Загляните позже — ресурсы появятся после модерации"
          }
        />
      ) : (
        <div className={`grid md:grid-cols-2 lg:grid-cols-3 gap-6 ${isFetching ? "opacity-60" : ""}`}>
          {filtered.map((resource) => (
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
                    <StatusBadge status="FREE" />
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

      {pagination && pagination.pages > 1 && !isLoading && !error ? (
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
