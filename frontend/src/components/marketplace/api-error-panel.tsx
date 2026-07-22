import { AlertOctagon } from 'lucide-react';

import type { FetchError } from '@/lib/marketplace-server';

interface ApiErrorPanelProps {
  title?: string;
  error: FetchError;
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Network error',
  400: 'Bad request',
  401: 'Kirish talab qilinadi',
  403: 'Ruxsat yo\'q',
  404: 'Topilmadi',
  409: 'Konflikt',
  429: 'Juda ko\'p so\'rov',
  500: 'Server xatoligi',
  502: 'Bad gateway',
  503: 'Xizmat mavjud emas',
  504: 'Gateway timeout',
};

/**
 * Renders the actual backend failure so we don't have to shell into the server
 * to debug 5xx. Shows status, backend `code`, message, path, and — when the
 * backend runs with APP_DEBUG_ERRORS=true — the exception class + rootCause.
 */
export function ApiErrorPanel({ title = "So'rov bajarilmadi", error }: ApiErrorPanelProps) {
  const statusLabel = STATUS_LABELS[error.status] ?? 'Xatolik';

  return (
    <div className="overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5 shadow-card">
      <div className="flex items-center gap-3 border-b border-destructive/20 bg-destructive/10 px-4 py-3">
        <AlertOctagon className="h-5 w-5 text-destructive" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black text-destructive">{title}</h2>
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-destructive/70">
            {error.status === 0 ? 'Network error' : `${error.status} ${statusLabel}`}
            {error.code ? ` · ${error.code}` : ''}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 text-sm">
        <Row label="Message" value={error.message || '—'} />
        <Row label="Path" value={error.path} mono />
        {error.details !== undefined && error.details !== null && (
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Details
            </div>
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-card p-3 text-[11px] leading-5 text-foreground/85">
              {formatDetails(error.details)}
            </pre>
          </div>
        )}
        {error.networkError && (
          <p className="text-xs text-muted-foreground">
            Backend'ga so'rov yubora olmadik. Xizmatlar yoqilganini tekshiring.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={
          mono
            ? 'break-all rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-foreground/90'
            : 'text-foreground'
        }
      >
        {value}
      </div>
    </div>
  );
}

function formatDetails(details: unknown) {
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}
