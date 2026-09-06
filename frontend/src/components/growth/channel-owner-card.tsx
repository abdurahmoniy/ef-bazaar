import { ChevronRight, Handshake } from 'lucide-react';
import { GrowthLink } from './growth-link';

export function ChannelOwnerCard({ placement, partner = false }: { placement: string; partner?: boolean }) {
  return (
    <GrowthLink href={partner ? '/partner' : '/partnership'} event="partnership_open" placement={placement}
      className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Handshake aria-hidden className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{partner ? 'Hamkor paneli' : 'Telegram kanalingiz bormi?'}</span>
        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{partner ? 'Kanalingiz, e’lonlar va daromad.' : 'E’lon qabul qiling. Joylash narxini o‘zingiz belgilang.'}</span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
    </GrowthLink>
  );
}
