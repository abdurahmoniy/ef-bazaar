/**
 * Route-level loading skeletons. loading.tsx replaces the whole page
 * (including the shell) while the SSR fetch runs, so these repeat a rough
 * outline of the header + sidebar + content so the swap-in doesn't jump.
 */

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function ShellSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95">
        <div className="container-page flex h-14 items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            <Bar className="h-4 w-32" />
          </div>
          <Bar className="h-8 w-28" />
        </div>
      </header>
      <main className="container-page py-4">
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="hidden rounded-xl border border-border bg-card p-3 shadow-card lg:block">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Bar className="h-3 w-4/5" />
                    <Bar className="h-2.5 w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <ShellSkeleton>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1.5">
            <Bar className="h-4 w-56" />
            <Bar className="h-3 w-24" />
          </div>
          <Bar className="h-9 w-40" />
        </div>
        <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Bar className="h-3.5 w-32 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bar className="h-3.5 w-3/5" />
                <Bar className="h-2.5 w-4/5" />
              </div>
              <Bar className="h-3 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </ShellSkeleton>
  );
}

export function MessageSkeleton() {
  return (
    <ShellSkeleton>
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
        <Bar className="h-6 w-20" />
        <div className="space-y-3 border-b border-border pb-4">
          <Bar className="h-6 w-3/4" />
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <Bar className="h-3 w-1/2" />
              <Bar className="h-3 w-1/3" />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Bar className="h-3.5 w-full" />
          <Bar className="h-3.5 w-11/12" />
          <Bar className="h-3.5 w-4/5" />
          <Bar className="h-3.5 w-2/3" />
        </div>
      </div>
    </ShellSkeleton>
  );
}
