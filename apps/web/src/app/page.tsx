export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="text-center space-y-4 p-8">
        <h1 className="text-5xl font-bold text-white">MTA Market</h1>
        <p className="text-xl text-slate-300">DRM-защищённая площадка продаж серверных ресурсов</p>
        <div className="pt-4 text-sm text-slate-400">
          Stage 1: каркас монорепозитория — Next.js 15 + React 19 + TypeScript
        </div>
      </div>
    </main>
  );
}
