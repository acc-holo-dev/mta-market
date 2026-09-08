"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Package, Star, Download } from "lucide-react";

interface Resource {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: string;
  price: number;
  status: string;
  averageRating: number | null;
  reviewCount: number;
  purchaseCount: number;
}

export default function ResourcesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["resources"],
    queryFn: async () => {
      const { data } = await api.get<{ data: Resource[] }>("/resources");
      return data.data;
    },
  });

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
          Скрипты, моды и другие ресурсы для MTA:SA серверов
        </p>
      </div>

      {!data || data.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <Package className="h-16 w-16 text-slate-400 mx-auto" />
            <h3 className="text-xl font-semibold">Ресурсов пока нет</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Станьте первым продавцом на платформе!
            </p>
            <Link href="/dashboard/resources/new">
              <Button variant="primary">Добавить ресурс</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.map((resource) => (
            <Link key={resource.id} href={`/resources/${resource.slug}`}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-xl">{resource.title}</CardTitle>
                    <span className="text-sm px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded">
                      {resource.type}
                    </span>
                  </div>
                  <CardDescription className="line-clamp-2">{resource.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <span>
                        {resource.averageRating ? resource.averageRating.toFixed(1) : "N/A"}
                      </span>
                      <span className="text-xs">({resource.reviewCount})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Download className="h-4 w-4" />
                      <span>{resource.purchaseCount}</span>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {resource.price === 0 ? (
                        <span className="text-green-600 dark:text-green-400">Бесплатно</span>
                      ) : (
                        <>{(resource.price / 100).toFixed(2)} ₽</>
                      )}
                    </span>
                    <Button variant="primary" size="sm">
                      Подробнее
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
