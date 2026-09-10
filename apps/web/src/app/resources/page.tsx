// Marketplace (PLAN-002 E-001..E-010): магазинная сетка ресурсов, фильтры по
// реальным enum-значениям, skeleton loading, marketplace empty state.
// Backend-функциональность (list + pagination) сохранена без изменений.
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchResources, type Resource } from "@/lib/api-ext";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { ResourceCard } from "@/components/ui/ResourceCard";
import { ResourceCardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { Store, SearchX } from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 12;

// Server has no filter params for the list endpoint — filtering is client-side
// on the fetched page of data (unchanged contract).
type PriceFilter = "all" | "free" | "paid";
type TypeFilter = "ALL" | "SCRIPT" | "MAP" | "MODEL" | "TEXTURE" | "SOUND" | "GAMEMODE";

const TYPES: [TypeFilter, string][] = [
  ["SCRIPT", "Скрипты"],
  ["MAP", "Карты"],
  ["MODEL", "Модели"],
  ["TEXTURE", "Текстуры"],
  ["SOUND", "Звуки"],
  ["GAMEMODE", "Гейммоды"],
];

const PRICE_FILTERS: [PriceFilter, string][] = [
  ["all", "Все"],
  ["free", "Бесплатные"],
  ["paid", "Платные"],
];

export default function ResourcesPage() {
  const [page, setPage] = useState(1);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

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
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Маркетплейс</h1>
        <p className="mt-1 text-content-secondary">
          {pagination
            ? `${pagination.total} ресурсов · страница ${pagination.page} из ${pagination.pages || 1}`
            : "Ресурсы для MTA:SA, прошедшие модерацию"}
        </p>
      </div>

      {/* Filters (E-003) */}
      <div className="flex flex-wrap items-center gap-3 mb-8" role="group" aria-label="Фильтры">
        <div
          className="inline-flex rounded-md border border-line-strong overflow-hidden"
          role="group"
          aria-label="Цена"
        >
          {PRICE_FILTERS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPriceFilter(value)}
              aria-pressed={priceFilter === value}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                priceFilter === value
                  ? "bg-accent text-white"
                  : "text-content-secondary hover:bg-surface-hover hover:text-content"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="w-44">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            aria-label="Тип ресурса"
          >
            <option value="ALL">Все типы</option>
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ResourceCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        filtersActive ? (
          <EmptyFiltered onReset={() => { setPriceFilter("all"); setTypeFilter("ALL"); }} />
        ) : (
          <EmptyMarketplace />
        )
      ) : (
        <div
          className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity ${
            isFetching ? "opacity-60" : ""
          }`}
        >
          {filtered.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} />
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && !isLoading && !error ? (
        <nav
          className="flex items-center justify-center gap-4 mt-12"
          aria-label="Постраничная навигация"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </Button>
          <span className="text-sm text-content-secondary">
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
        </nav>
      ) : null}
    </div>
  );
}

// E-008: пусто из-за фильтров — предлагаем сброс.
function EmptyFiltered({ onReset }: { onReset: () => void }) {
  return (
    <div className="text-center py-20">
      <SearchX className="h-12 w-12 text-content-muted mx-auto mb-4" />
      <p className="text-lg font-semibold">Под фильтры ничего не подошло</p>
      <p className="mt-1 text-sm text-content-secondary">
        На этой странице нет ресурсов с выбранными параметрами.
      </p>
      <Button variant="outline" size="sm" className="mt-5" onClick={onReset}>
        Сбросить фильтры
      </Button>
    </div>
  );
}

// E-008: маркетплейс действительно пуст.
function EmptyMarketplace() {
  return (
    <div className="text-center py-20">
      <Store className="h-12 w-12 text-content-muted mx-auto mb-4" />
      <p className="text-lg font-semibold">Пока нет опубликованных ресурсов</p>
      <p className="mt-1 text-sm text-content-secondary max-w-md mx-auto">
        Ресурсы появляются в каталоге после проверки модератором. Загляните позже или откройте свой
        магазин.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link href="/seller">
          <Button variant="outline" size="sm">
            <Store className="mr-2 h-4 w-4" />
            Стать продавцом
          </Button>
        </Link>
        <Link href="/">
          <Button variant="ghost" size="sm">
            На главную
          </Button>
        </Link>
      </div>
    </div>
  );
}
