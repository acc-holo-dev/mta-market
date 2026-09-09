// Navbar component (PLAN-001 J-001 + K-001 terminology)
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { fetchMe, formatRub } from "@/lib/api-ext";
import { Button } from "@/components/ui/Button";
import { ShoppingBag, User, LogOut, Settings, Wallet } from "lucide-react";

const linkClass =
  "text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400";

export function Navbar() {
  const { user, accessToken, isAuthenticated, clearAuth } = useAuthStore();

  // C-004: balance travels with the profile; show it inline when signed in.
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: accessToken !== null,
    staleTime: 30_000,
    retry: false,
  });

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/";
  };

  return (
    <nav className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <ShoppingBag className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold">MTA Market</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/" className={linkClass}>
              Маркетплейс
            </Link>
            {isAuthenticated() && user ? (
              <>
                <Link href="/account" className={linkClass}>
                  Профиль
                </Link>
                <Link href="/dashboard" className={linkClass}>
                  Покупки
                </Link>
                <Link href="/seller" className={linkClass}>
                  Продавец
                </Link>
                {user.role === "ADMIN" || user.role === "MODERATOR" ? (
                  <Link href="/admin" className={linkClass}>
                    Админ
                  </Link>
                ) : null}
              </>
            ) : null}
          </div>

          {/* Auth Section */}
          <div className="flex items-center space-x-4">
            {isAuthenticated() && user ? (
              <>
                {me ? (
                  <span
                    className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300"
                    title="Ваш баланс"
                  >
                    <Wallet className="h-4 w-4 text-green-600 dark:text-green-400" />
                    {formatRub(me.balance.available)}
                  </span>
                ) : null}
                <Link href="/account">
                  <Button variant="ghost" size="sm">
                    <User className="mr-2 h-4 w-4" />
                    {user.displayName || user.username}
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Выход
                </Button>
              </>
            ) : (
              <>
                <Link href="/auth/login">
                  <Button variant="ghost" size="sm">
                    Войти
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button variant="primary" size="sm">
                    Регистрация
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
