import { Toaster } from 'sonner';

import { AdminPlanTabs } from '@/components/admin/admin-plan-tabs';

/** The admin gate and shell come from `src/app/admin/layout.tsx`. */
export default function AdminPlansLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Moliya &amp; To‘lovlar</span>
        <h1 className="text-2xl font-extrabold text-foreground">Tariflar</h1>
      </div>
      <AdminPlanTabs />
      {children}
      <Toaster richColors closeButton />
    </div>
  );
}
