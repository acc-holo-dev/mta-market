"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Star, Download, Package, ShieldCheck } from "lucide-react";

interface Resource {
  id: number;
  slug: string;
  title: string;
  description: string;
  type: string;
  price: number;
  status: string;
  averageRating: number | null;
  reviewCount: number;
  purchaseCount: number;
  createdAt: string;
}

export default function ResourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const slug = params.slug as string;

  const {
    data: resource,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["resource", slug],
    queryFn: async () => {
      const { data } = await api.get<Resource>(`/resources/${slug}`);
      return data;
    },
  });

  const handlePurchase = async () => {
    if (!isAuthenticated()) {
      router.push("/auth/login");
      return;
    }

    try {
      // Create purchase
      const { data: purchase } = await api.post("/purchases", {
        resourceSlug: slug,
      });

      // Create payment
      const { data: payment } = await api.post("/payments/create", {
        purchaseId: purchase.id,
      });

      if (payment.paymentUrl) {
        // Redirect to YooKassa
        window.location.href = payment.paymentUrl;
      } else {
        // Dev mode - simulate
        await api.post(`/payments/${purchase.id}/simulate`);
        router.push("/dashboard/purchases");
      }
    } catch (error) {
      console.error("Purchase error:", error);
      alert("Ошибка при создании покупки");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mt-2"></div>
          </CardHeader>
          <CardContent>
            <div className="h-40 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Ресурс не найден</CardTitle>
            <CardDescription>Возможно, он был удалён или ещё не опубликован.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-3xl">{resource.title}</CardTitle>
                  <CardDescription className="text-base">{resource.description}</CardDescription>
                </div>
                <span className="text-sm px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded">
                  {resource.type}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Stats */}
              <div className="flex items-center gap-6 text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  <span className="font-medium">
                    {resource.averageRating ? resource.averageRating.toFixed(1) : "N/A"}
                  </span>
                  <span className="text-sm">({resource.reviewCount} отзывов)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  <span>{resource.purchaseCount} покупок</span>
                </div>
              </div>

              {/* Description */}
              <div className="prose dark:prose-invert max-w-none">
                <h3>Описание</h3>
                <p>{resource.description}</p>
              </div>

              {/* Features */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">DRM защита</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Лицензия привязывается к серверу
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <Package className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Обновления</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Доступ ко всем версиям
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Купить ресурс</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl font-bold">
                  {resource.price === 0 ? (
                    <span className="text-green-600 dark:text-green-400">Бесплатно</span>
                  ) : (
                    <>{(resource.price / 100).toFixed(2)} ₽</>
                  )}
                </div>
                {resource.price > 0 && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Единоразовая покупка
                  </p>
                )}
              </div>
              <Button variant="primary" size="lg" className="w-full" onClick={handlePurchase}>
                {resource.price === 0 ? "Получить бесплатно" : "Купить сейчас"}
              </Button>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Безопасная оплата через ЮKassa
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
