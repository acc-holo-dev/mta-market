"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import {
  fetchResource,
  fetchResourceVersions,
  fetchResourceReviews,
  fetchMyPurchases,
  createPurchase,
  createPayment,
  postReview,
  formatRub,
  getErrorMessage,
  type Purchase,
} from "@/lib/api-ext";
import { useAuthStore } from "@/store/auth";
import { bootstrapSession } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Star, Package, ShieldCheck } from "lucide-react";

export default function ResourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { accessToken, isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  // Restore session from refresh cookie on reload (token is memory-only).
  if (typeof window !== "undefined" && !accessToken) {
    void bootstrapSession();
  }

  const { data: resource, isLoading, error } = useQuery({
    queryKey: ["resource", slug],
    queryFn: () => fetchResource(slug),
  });

  const { data: versions } = useQuery({
    queryKey: ["resource-versions", slug],
    queryFn: () => fetchResourceVersions(slug),
  });

  const { data: reviewsData } = useQuery({
    queryKey: ["resource-reviews", slug],
    queryFn: () => fetchResourceReviews(slug, 1, 20),
  });

  // Ownership: needed for the review form (must have a COMPLETED purchase).
  const { data: myPurchases } = useQuery({
    queryKey: ["purchases", "my", slug],
    queryFn: fetchMyPurchases,
    enabled: accessToken !== null,
  });

  const owned = useMemo(
    () =>
      (myPurchases as Purchase[] | undefined)?.some(
        (p) => p.resource.slug === slug && p.status === "COMPLETED"
      ) ?? false,
    [myPurchases, slug]
  );

  // ---------- Checkout state (M-004/M-005) ----------
  const [discountCode, setDiscountCode] = useState("");
  const [checkoutResult, setCheckoutResult] = useState<
    | { kind: "completed"; licenseId: string }
    | {
        kind: "pending";
        purchaseId: string;
        amount: number;
        originalAmount: number;
        discount?: { amount: number; percentage: number };
        devMessage?: string;
      }
    | null
  >(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleBuy = async () => {
    if (!isAuthenticated()) {
      router.push("/auth/login");
      return;
    }
    setBusy(true);
    setCheckoutError(null);
    try {
      const purchase = await createPurchase(slug, discountCode.trim() || undefined);

      if (purchase.status === "completed") {
        setCheckoutResult({ kind: "completed", licenseId: purchase.licenseId });
        qc.invalidateQueries({ queryKey: ["purchases"] });
        return;
      }

      // Paid purchase (possibly discounted): create the YooKassa payment.
      let devMessage: string | undefined;
      try {
        const payment = await createPayment(purchase.purchaseId);
        if (payment.paymentUrl) {
          window.location.href = payment.paymentUrl;
          return;
        }
        devMessage = payment.message;
      } catch (pe) {
        devMessage = getErrorMessage(pe, "Не удалось создать платёж");
      }

      setCheckoutResult({
        kind: "pending",
        purchaseId: purchase.purchaseId,
        amount: purchase.amount,
        originalAmount: purchase.originalAmount,
        discount: purchase.discount,
        devMessage,
      });
      qc.invalidateQueries({ queryKey: ["purchases"] });
    } catch (e) {
      setCheckoutError(getErrorMessage(e, "Ошибка при оформлении покупки"));
    } finally {
      setBusy(false);
    }
  };

  // ---------- Review form ----------
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);

  const reviewMutation = useMutation({
    mutationFn: () => postReview(slug, rating, comment),
    onSuccess: () => {
      setReviewMsg("Отзыв отправлен");
      setComment("");
      setReviewErr(null);
      qc.invalidateQueries({ queryKey: ["resource-reviews", slug] });
    },
    onError: (e) => {
      setReviewMsg(null);
      setReviewErr(getErrorMessage(e, "Не удалось отправить отзыв"));
    },
  });

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
              <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">DRM защита</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Лицензия привязывается к серверу
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Versions */}
          <Card>
            <CardHeader>
              <CardTitle>Версии</CardTitle>
              <CardDescription>История версий ресурса</CardDescription>
            </CardHeader>
            <CardContent>
              {!versions || versions.length === 0 ? (
                <p className="text-sm text-slate-500">Версии пока не опубликованы.</p>
              ) : (
                <ul className="space-y-3">
                  {versions.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-start justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg"
                    >
                      <div>
                        <span className="font-semibold">v{v.version}</span>
                        {v.changelog ? (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {v.changelog}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-xs text-slate-500">
                        {new Date(v.createdAt).toLocaleDateString("ru-RU")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Reviews */}
          <Card>
            <CardHeader>
              <CardTitle>Отзывы</CardTitle>
              <CardDescription>
                {reviewsData?.stats?.total
                  ? `Средняя оценка: ${reviewsData.stats.averageRating?.toFixed(1) ?? "—"} (${reviewsData.stats.total})`
                  : "Пока нет отзывов"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {accessToken && owned ? (
                <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
                  <p className="text-sm font-medium">Оставить отзыв</p>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        aria-label={`Оценка ${n}`}
                        className="p-0.5"
                      >
                        <Star
                          className={`h-6 w-6 ${
                            n <= rating
                              ? "text-yellow-500 fill-yellow-500"
                              : "text-slate-300 dark:text-slate-600"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ваш отзыв"
                  />
                  <Button
                    size="sm"
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate()}
                  >
                    Отправить отзыв
                  </Button>
                  {reviewMsg ? (
                    <p className="text-sm text-green-600 dark:text-green-400">{reviewMsg}</p>
                  ) : null}
                  {reviewErr ? (
                    <p className="text-sm text-red-600 dark:text-red-400">{reviewErr}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Войдите и приобретите ресурс, чтобы оставить отзыв.
                </p>
              )}

              {reviewsData?.data.map((r) => (
                <div
                  key={r.id}
                  className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {r.user?.displayName || r.user?.username || "Пользователь"}
                    </span>
                    <span className="flex">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`h-4 w-4 ${
                            n <= r.rating
                              ? "text-yellow-500 fill-yellow-500"
                              : "text-slate-300 dark:text-slate-600"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-slate-500 ml-auto">
                      {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                  {r.comment ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{r.comment}</p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: checkout */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{resource.price === 0 ? "Получить бесплатно" : "Купить ресурс"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl font-bold">
                  {resource.price === 0 ? (
                    <span className="text-green-600 dark:text-green-400">Бесплатно</span>
                  ) : (
                    <>{formatRub(resource.price)}</>
                  )}
                </div>
                {resource.price > 0 && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Единоразовая покупка
                  </p>
                )}
              </div>

              {resource.price > 0 ? (
                <div>
                  <label className="text-sm text-slate-600 dark:text-slate-400">
                    Промокод (если есть)
                  </label>
                  <Input
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    placeholder="Код скидки"
                    className="mt-1"
                  />
                </div>
              ) : null}

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={handleBuy}
              >
                {busy ? "Оформление..." : resource.price === 0 ? "Получить" : "Купить сейчас"}
              </Button>
              {resource.price > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  Безопасная оплата через ЮKassa
                </p>
              )}

              {checkoutError ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {checkoutError}
                </p>
              ) : null}

              {checkoutResult?.kind === "completed" ? (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg space-y-2">
                  <StatusBadge status="COMPLETED">Покупка завершена</StatusBadge>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Лицензия выдана. Смотрите раздел{" "}
                    <a href="/account" className="text-blue-600 dark:text-blue-400 underline">
                      Мои покупки
                    </a>
                    .
                  </p>
                </div>
              ) : null}

              {checkoutResult?.kind === "pending" ? (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg space-y-2">
                  {checkoutResult.discount ? (
                    <div className="text-sm space-y-1">
                      <p>
                        <span className="line-through text-slate-500 mr-2">
                          {formatRub(checkoutResult.originalAmount)}
                        </span>
                        <span className="font-bold text-green-600 dark:text-green-400">
                          {formatRub(checkoutResult.amount)}
                        </span>
                        <span className="ml-2 text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-2 py-0.5 rounded">
                          −{checkoutResult.discount.percentage}%
                        </span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm">
                      К оплате: <span className="font-bold">{formatRub(checkoutResult.amount)}</span>
                    </p>
                  )}
                  <StatusBadge status="PENDING_PAYMENT">Ожидает оплаты</StatusBadge>
                  {checkoutResult.devMessage ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {checkoutResult.devMessage}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Перенаправление на платёжную систему...
                    </p>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Покупки и лицензии доступны в личном кабинете.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
