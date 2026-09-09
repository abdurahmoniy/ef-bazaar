'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  HelpCircle,
  LayoutGrid,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Headphones,
  UploadCloud,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';

import {
  HELP_CATEGORIES,
  HELP_ITEMS,
  searchHelpItems,
  type HelpCategory,
  type HelpItem,
} from '@/lib/help-data';
import { siteConfig } from '@/lib/site';
import { cn } from '@/lib/utils';

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  LayoutGrid,
  Sparkles,
  ShieldCheck,
  ShoppingBag,
  UploadCloud,
  Wallet,
  HelpCircle,
};

interface HelpViewProps {
  initialCategory?: HelpCategory;
  initialQuery?: string;
}

export function HelpView({
  initialCategory = 'all',
  initialQuery = '',
}: HelpViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>(initialCategory);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(['how-escrow-works', 'scam-prevention-rules']));

  const filteredItems = useMemo(() => {
    return searchHelpItems(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(filteredItems.map((item) => item.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-black text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Yordam markazi & Qo‘llanma
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-4xl">
            Sizga qanday yordam bera olamiz?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base leading-relaxed">
            eFootball akkountlarini xavfsiz sotib olish, sotish, obmen qilish, Garov (Escrow) tizimi va boshqa barcha imkoniyatlar bo‘yicha to‘liq qo‘llanma.
          </p>

          {/* Search Box */}
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Masalan: Garov, Konami ID, Tangalar, Obmen, Pul yechish..."
              className="h-11 w-full rounded-xl border border-input bg-background/80 pl-10 pr-10 text-sm font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Qidiruvni tozalash"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Category Pills */}
      <section aria-label="Bo‘limlar" className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2">
          {HELP_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICON_MAP[category.iconName] || LayoutGrid;
            const active = selectedCategory === category.id;

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition sm:text-sm',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-primary-foreground' : 'text-primary')} />
                <span>{category.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* List Header & Controls */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
          {filteredItems.length} ta mavzu topildi
        </p>

        {filteredItems.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={expandAll}
              className="font-bold text-muted-foreground transition hover:text-foreground"
            >
              Hammasini ochish
            </button>
            <span className="text-border">·</span>
            <button
              type="button"
              onClick={collapseAll}
              className="font-bold text-muted-foreground transition hover:text-foreground"
            >
              Hammasini yopish
            </button>
          </div>
        )}
      </div>

      {/* Articles / FAQ Accordion */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h3 className="mt-3 text-base font-black text-foreground">Hech narsa topilmadi</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            &quot;{searchQuery}&quot; bo‘yicha ma‘lumot topilmadi. Qidiruv so‘zini o‘zgartiring yoki barcha toifalarni ko‘ring.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            Barchasini ko‘rsatish
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <HelpAccordionCard
              key={item.id}
              item={item}
              expanded={expandedIds.has(item.id)}
              onToggle={() => toggleExpand(item.id)}
            />
          ))}
        </div>
      )}

      {/* Support Contact Box */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-muted/50 p-6 shadow-card sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-black uppercase text-primary">
              Savolingizga javob topmadingizmi?
            </span>
            <h3 className="mt-2 text-lg font-black text-foreground sm:text-xl">
              Administrator bilan bevosita bog‘laning
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Savollaringiz, takliflaringiz yoki xavfsizlik yuzasidan murojaatlaringiz bo‘lsa, rasmiy Telegram qo‘llab-quvvatlash botimiz 24/7 xizmatingizda.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/support?category=SUPPORT"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-card transition hover:bg-primary/90"
            >
              <Headphones className="h-4 w-4" />
              Chat orqali yozish
            </Link>
            <Link
              href={siteConfig.links.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              <Send className="h-4 w-4" />
              Telegram bot
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function HelpAccordionCard({
  item,
  expanded,
  onToggle,
}: {
  item: HelpItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      id={item.id}
      className={cn(
        'group rounded-xl border transition',
        expanded
          ? 'border-primary/40 bg-card shadow-sm ring-1 ring-primary/20'
          : 'border-border bg-card/60 hover:border-border/80 hover:bg-card'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 p-4 text-left sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-foreground sm:text-base">{item.title}</h3>
            {item.featured && (
              <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-700 dark:text-amber-300">
                Muhim
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm leading-relaxed">
            {item.summary}
          </p>
        </div>

        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180 bg-primary/10 text-primary'
          )}
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-5 pt-3 sm:px-5">
          <div className="space-y-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {item.content.map((paragraph, index) => (
              <p key={index} className="text-foreground/90 font-medium">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/50">
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>

            {item.actionUrl && item.actionLabel && (
              <Link
                href={item.actionUrl}
                className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20"
              >
                {item.actionLabel} →
              </Link>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
