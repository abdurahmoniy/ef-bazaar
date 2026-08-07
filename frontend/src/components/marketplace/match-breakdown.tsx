import { CheckCircle2, CircleX, Repeat2, Star } from 'lucide-react';

import {
  attributeCardList,
  type AttachedPlayerCard,
  type ListingResponse,
} from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

export function MatchBreakdown({ listing }: { listing: ListingResponse }) {
  const details = listing.matchDetails;
  if (!details) return null;
  const ownedById = new Map(attributeCardList(listing, 'valuable_players')
    .map((card) => [card.efhubId, card]));
  const priorities = new Set(details.priorityEfhubIds ?? []);

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Tarkib mosligi</p>
          <h2 className="mt-1 text-2xl font-black">{details.percent}% mos</h2>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            Vaznli ball: {formatWeight(details.earnedWeight)} / {formatWeight(details.possibleWeight)}
          </p>
        </div>
        <span className="rounded-full bg-primary px-3 py-1 text-sm font-black text-primary-foreground">
          {details.exactCount + details.alternateCount}/{details.selectedCount}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <MatchGroup
          title="Aniq karta"
          icon={<CheckCircle2 className="h-4 w-4" />}
          ids={details.exactEfhubIds ?? []}
          ownedById={ownedById}
          priorities={priorities}
          tone="success"
        />
        <MatchGroup
          title="Boshqa nashr (75%)"
          icon={<Repeat2 className="h-4 w-4" />}
          ids={details.alternateEfhubIds ?? []}
          ownedById={ownedById}
          priorities={priorities}
          tone="alternate"
        />
        <MatchGroup
          title="Yetishmaydi"
          icon={<CircleX className="h-4 w-4" />}
          ids={details.missingEfhubIds ?? []}
          ownedById={ownedById}
          priorities={priorities}
          tone="missing"
        />
      </div>
      <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
        Yulduzli maqsadlar 3× reyting beradi, lekin majburiy emas. Rangdan tashqari
        belgi va matn ham natija turini ko&apos;rsatadi.
      </p>
    </section>
  );
}

function MatchGroup({
  title,
  icon,
  ids,
  ownedById,
  priorities,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  ids: number[];
  ownedById: Map<number, AttachedPlayerCard>;
  priorities: Set<number>;
  tone: 'success' | 'alternate' | 'missing';
}) {
  return (
    <div className="rounded-lg bg-card p-2.5">
      <h3 className={cn(
        'flex items-center gap-1.5 text-xs font-black',
        tone === 'success' && 'text-emerald-700 dark:text-emerald-400',
        tone === 'alternate' && 'text-amber-700 dark:text-amber-300',
        tone === 'missing' && 'text-destructive',
      )}>
        {icon}
        {title} · {ids.length}
      </h3>
      {ids.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Yo&apos;q</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {ids.map((efhubId) => {
            const card = ownedById.get(efhubId);
            return (
              <li key={efhubId} className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
                {card?.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.imageUrl} alt="" className="h-7 w-5 shrink-0 object-contain" />
                )}
                <span className="min-w-0 truncate" title={card?.name ?? `Karta #${efhubId}`}>
                  {card?.name ?? `Maqsad karta #${efhubId}`}
                </span>
                {priorities.has(efhubId) && (
                  <span title="Ustuvor: 3×" aria-label="Ustuvor: 3 karra">
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatWeight(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
