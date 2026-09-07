"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import api from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { Package, ShoppingBag, Star, Plus } from "lucide-react";

interface Purchase {
  id: number;
  resourceId: number;
  status: string;
  priceSnapshot: number;
  createdAt: string;
  resource: {
    title: string;
    slug: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  const { data: purchases } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data } = await api.get<{ data: Purchase[] }>("/purchases/my");
      return data.data;
    },
    enabled: isAuthenticated(),
  });

  if (!isAuthenticated() || !user) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Привет, {user.displayName || user.username}!</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Управляйте своими покупками и ресурсами
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Quick Stats */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Мои покупки</CardTitle>
            <ShoppingBag className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{purchases?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Мои ресурсы</CardTitle>
            <Package className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Отзывы</CardTitle>
            <Star className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Стать продавцом</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/resources/new">
              <Button variant="secondary" size="sm" className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Добавить ресурс
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Purchases */}
      <Card>
        <CardHeader>
          <CardTitle>Недавние покупки</CardTitle>
          <CardDescription>Ваши последние приобретения</CardDescription>
        </CardHeader>
        <CardContent>
          {!purchases || purchases.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">У вас пока нет покупок</p>
              <Link href="/resources">
                <Button variant="primary" size="sm" className="mt-4">
                  Просмотреть каталог
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <div>
                    <Link
                      href={`/resources/${purchase.resource.slug}`}
                      className="font-semibold hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {purchase.resource.title}
                    </Link>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {new Date(purchase.createdAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {(purchase.priceSnapshot / 100).toFixed(2)} ₽
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        purchase.status === "COMPLETED"
                          ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                          : "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400"
                      }`}
                    >
                      {purchase.status}
                    </span>
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
