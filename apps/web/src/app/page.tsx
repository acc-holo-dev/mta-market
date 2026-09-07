import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ShoppingBag, Shield, Zap, Users } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-4 py-24">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold">MTA Market</h1>
            <p className="text-xl md:text-2xl text-blue-100">
              DRM-защищённая площадка продаж серверных ресурсов для MTA:SA
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link href="/resources">
                <Button size="lg" variant="secondary">
                  <ShoppingBag className="mr-2 h-5 w-5" />
                  Просмотреть ресурсы
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-white text-blue-600 hover:bg-blue-50"
                >
                  Начать продавать
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Почему MTA Market?</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Feature 1 */}
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-4">
                  <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <h3 className="text-xl font-semibold">DRM защита</h3>
              <p className="text-slate-600 dark:text-slate-400">
                Надёжная система лицензирования с привязкой к серверу и проверкой подлинности
              </p>
            </div>

            {/* Feature 2 */}
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-4">
                  <Zap className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <h3 className="text-xl font-semibold">Быстрые выплаты</h3>
              <p className="text-slate-600 dark:text-slate-400">
                Автоматические выплаты через ЮKassa. Получайте деньги сразу после продажи
              </p>
            </div>

            {/* Feature 3 */}
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-4">
                  <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <h3 className="text-xl font-semibold">Активное сообщество</h3>
              <p className="text-slate-600 dark:text-slate-400">
                Отзывы, рейтинги и поддержка от опытных разработчиков
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-slate-100 dark:bg-slate-800">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-3xl font-bold">Готовы начать?</h2>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Присоединяйтесь к маркетплейсу и монетизируйте свои разработки
            </p>
            <Link href="/auth/register">
              <Button size="lg" variant="primary">
                Зарегистрироваться бесплатно
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center text-sm text-slate-600 dark:text-slate-400">
            <p>&copy; 2025 MTA Market. Все права защищены.</p>
            <div className="flex justify-center gap-4 mt-4">
              <Link href="/terms" className="hover:text-blue-600 dark:hover:text-blue-400">
                Условия использования
              </Link>
              <Link href="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400">
                Политика конфиденциальности
              </Link>
              <Link href="/docs" className="hover:text-blue-600 dark:hover:text-blue-400">
                Документация
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
