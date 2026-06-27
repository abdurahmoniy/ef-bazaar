import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="container relative flex min-h-screen flex-col items-center justify-center py-16">
      <div className="glass-strong relative max-w-2xl rounded-2xl p-10 text-center sm:p-14">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-cyber-cyan">
          <Sparkles className="h-3 w-3" />
          eFootball Marketplace
        </div>

        <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl">
          <span className="text-gradient">efBazaar</span>
        </h1>

        <p className="mb-8 text-lg text-muted-foreground sm:text-xl">
          Pro accountlar, real narxlar, xavfsiz savdo. Telegram orqali kiring va boshlang.
        </p>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/auth/register"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyber-cyan to-cyber-purple px-6 py-3 font-semibold text-white shadow-glow-cyan transition hover:shadow-glow-purple"
          >
            Boshlash
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/auth/login"
            className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-semibold text-foreground backdrop-blur transition hover:bg-white/10"
          >
            Akkountim bor
          </Link>
        </div>
      </div>
    </main>
  );
}
