// Homepage (PLAN-002 D-001..D-004): marketplace-oriented, реальные данные API.
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchResources, type Resource } from "@/lib/api-ext";
import { Button } from "@/components/ui/Button";
import { ResourceCard } from "@/components/ui/ResourceCard";
import { ResourceCardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ArrowRight, Search, ShieldCheck, Sparkles, Store } from "lucide-react";
import { useMemo } from "react";

export default function HomePage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["resources", "home", 1],
    queryFn: () => fetchResources(1, 12),
  });

  const resources: Resource[] = data?.data ?? [];

  const newest = resources.slice(0, 4);
  const popular = useMemo(
    () =>
      [...resources]
        .filter((r) => r.rating != null)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 4),
    [resources]
  );
  const free = resources.filter((r) => r.price === 0).slice(0, 4);

  const sections: { title: string; description: string; items: Resource[]; href?: string }[] = [
    {
      title: "Новинки",
      description: "Свежие публикации, прошедшие модерацию",
      items: newest,
    },
    {
      title: "Высокий рейтинг",
      description: "Ресурсы с лучшими оценками покупателей",
      items: popular,
    },
    {
      title: "Бесплатные ресурсы",
      description: "Попробуйте качественные материалы без оплаты",
      items: resources.filter((r) => r.price === 0),
    },
  ];

  return (
    <div>
      {/* Hero (D-002) */}
      <section className="border-b border-line bg-gradient-to-b from-surface-raised to-background">
        <div className="mx-auto max-w-7xl px-4 py-16 md:py-24">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-content-secondary">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Маркетплейс серверных ресурсов
            </p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight">
              Ресурсы для твоего сервера{" "}
              <span className="text-accent-strong">MTA:SA</span>
            </h1>
            <p className="mt-4 text-lg text-content-secondary max-w-2xl">
              Скрипты, карты, модели и готовые гейммоды от проверенных разработчиков. Каждый ресурс
              проходит модерацию, а покупка выдаёт персональную лицензию с DRM-защитой.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/resources">
                <Button size="lg" className="w-full sm:w-auto">
                  <Search className="mr-2 h-5 w-5" />
                  Открыть Маркетплейс
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Создать аккаунт
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3 max-w-3xl">
            {[
              {
                icon: ShieldCheck,
                title: "Лицензия и DRM",
                text: "Покупка выдаёт лицензию, привязанную к вашему серверу",
              },
              {
                icon: Sparkles,
                title: "Модерация ресурсов",
                text: "Каждая публикация проверяется командой площадки",
              },
              {
                icon: Store,
                title: "Поддержка авторов",
                text: "Покупайте напрямую у разработчиков и оставляйте отзывы",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-card border border-line bg-surface p-4">
                <Icon className="h-5 w-5 text-accent mb-2" />
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs text-content-secondary">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Resource sections (D-003): реальные данные через существующий API */}
      <section className="mx-auto max-w-7xl px-4 py-12 space-y-12">
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ResourceCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : resources.length === 0 ? (
          <div className="text-center py-16">
            <h2 className="text-2xl font-bold">Маркетплейс скоро наполнится</h2>
            <p className="mt-2 text-content-secondary max-w-xl mx-auto">
              Ресурсы появляются здесь сразу после прохождения модерации. Загляните позже или
              станьте первым продавцом.
            </p>
            <Link href="/seller" className="inline-block mt-6">
              <Button variant="outline">
                <Store className="mr-2 h-4 w-4" />
                Стать продавцом
              </Button>
            </Link>
          </div>
        ) : (
          sections
            .filter((s) => s.items.length > 0)
            .map((section) => (
              <div key={section.title}>
                <SectionHeader title={section.title} description={section.description} />
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {section.items.slice(0, 4).map((r) => (
                    <ResourceCard key={r.id} resource={r} />
                  ))}
                </div>
              </div>
            ))
        )}
      </section>

      {/* Seller CTA (D-004): заметный, но не доминирующий */}
      <section className="border-t border-line bg-surface/40">
        <div className="mx-auto max-w-7xl px-4 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Вы разработчик ресурсов для MTA:SA?</h2>
            <p className="mt-1 text-sm text-content-secondary">
              Откройте магазин, публикуйте ресурсы и получайте продажи с защитой лицензий.
            </p>
          </div>
          <Link href="/seller" className="flex-shrink-0">
            <Button variant="outline">
              Стать продавцом
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
