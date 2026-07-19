/**
 * Route-level loading skeletons. loading.tsx replaces the whole page
 * (including the shell) while the SSR fetch runs, so these repeat a rough
 * outline of the header + sidebar + content so the swap-in doesn't jump.
 * Layout mirrors MailShell: fixed header, sidebar column, white mail pane.
 */

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function ShellSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            <Bar className="h-4 w-32" />
          </div>
          <Bar className="h-8 w-28" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-background p-2 pt-4 lg:block xl:w-80">
          <Bar className="mb-3 ml-2 h-3 w-24" />
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg py-2.5 pl-3.5 pr-2.5">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Bar className="h-3 w-4/5" />
                  <Bar className="h-2.5 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card">{children}</main>
      </div>
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <ShellSkeleton>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="hidden h-10 w-10 animate-pulse rounded-full bg-muted sm:block" />
          <div className="space-y-1.5">
            <Bar className="h-4 w-56" />
            <Bar className="h-3 w-24" />
          </div>
        </div>
        <Bar className="h-9 w-40" />
      </div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 sm:px-6">
        <Bar className="h-9 w-full max-w-md rounded-full" />
        <Bar className="h-9 w-24 rounded-full" />
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 sm:px-6">
            <Bar className="h-3.5 w-40 shrink-0" />
            <Bar className="h-3.5 min-w-0 flex-1" />
            <Bar className="h-3 w-14 shrink-0" />
          </div>
        ))}
      </div>
    </ShellSkeleton>
  );
}

export function MessageSkeleton() {
  return (
    <ShellSkeleton>
      <div className="flex items-center justify-between border-b border-border px-4 py-2 sm:px-6">
        <Bar className="h-7 w-20 rounded-full" />
        <Bar className="h-7 w-24 rounded-full" />
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <div className="space-y-4 border-b border-border pb-5">
          <Bar className="h-6 w-3/4" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
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
