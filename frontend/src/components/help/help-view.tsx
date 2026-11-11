'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  HelpCircle,
  LayoutGrid,
  Play,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Headphones,
  UploadCloud,
  Video,
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
import { listPublicGuides, resolveGuideCategory, type Guide } from '@/lib/guides';
import { siteConfig } from '@/lib/site';
import { cn } from '@/lib/utils';
import { InstagramIcon, TelegramIcon } from '@/components/brand/social-icons';
import { VideoGuideCard } from '@/components/help/video-guide-card';
import { VideoPlayerModal } from '@/components/help/video-player-modal';

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
  initialGuides?: Guide[];
}

export function HelpView({
  initialCategory = 'all',
  initialQuery = '',
  initialGuides = [],
}: HelpViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>(initialCategory);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [guides, setGuides] = useState<Guide[]>(initialGuides);
  const [loadingGuides, setLoadingGuides] = useState(initialGuides.length === 0);
  const [activeVideoGuide, setActiveVideoGuide] = useState<Guide | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(['how-escrow-works', 'scam-prevention-rules']),
  );

  // Savdo paneli va kanal postlari /help#<id> ga havola beradi: maqola
  // yopiq qolsa, odam sahifa boshida nima uchun kelganini topa olmaydi.
  useEffect(() => {
    function openFromHash() {
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return; // buzilgan hash sahifani yiqitmasin
      }
      if (!HELP_ITEMS.some((item) => item.id === id)) return;
      setSelectedCategory('all');
      setSearchQuery('');
      setExpandedIds((prev) => new Set(prev).add(id));
      window.requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      });
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const fetched = await listPublicGuides();
        if (!cancelled) {
          setGuides(fetched);
        }
      } catch {
        // Fallback silently if offline or not reachable
      } finally {
        if (!cancelled) setLoadingGuides(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    return searchHelpItems(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const filteredVideoGuides = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return guides.filter((guide) => {
      const category = resolveGuideCategory(guide);
      const matchesCategory = selectedCategory === 'all' || category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        guide.title.toLowerCase().includes(q) ||
        guide.description.toLowerCase().includes(q)
      );
    });
  }, [guides, searchQuery, selectedCategory]);

  const videoCountsByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: guides.length };
    for (const guide of guides) {
      const cat = resolveGuideCategory(guide);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [guides]);

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
    <div className="space-y-8 pb-12">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-card via-card to-background p-6 shadow-card sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-black text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Yordam markazi
            </span>
            {guides.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success">
                <Video className="h-3 w-3" />
                {guides.length} ta video qo‘llanma
              </span>
            )}
          </div>

          <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground sm:text-4xl">
            Sizga qanday yordam bera olamiz?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base leading-relaxed">
            eFootball akkountlarini garov orqali sotish, sotib olish va almashish bo‘yicha video va yozma qo‘llanmalar.
          </p>

          {/* Search Box */}
          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Qidirish: garov, almashish, Konami ID, tangalar…"
              className="h-12 w-full rounded-2xl border border-input bg-background/90 pl-10 pr-10 text-sm font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Qidiruvni tozalash"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
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
            const videoCount = videoCountsByCategory[category.id] || 0;

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  'group flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition sm:text-sm',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-primary-foreground' : 'text-primary')} />
                <span>{category.label}</span>
                {videoCount > 0 && (
                  <span
                    className={cn(
                      'ml-1 inline-flex items-center rounded-md px-1.5 py-0.2 text-[10px] font-black',
                      active
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-primary/10 text-primary',
                    )}
                  >
                    {videoCount} video
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Video Guides Section */}
      <section aria-label="Video qo‘llanmalar" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Video className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-black text-foreground sm:text-lg">
                Video qo‘llanmalar
              </h2>
            </div>
            {filteredVideoGuides.length > 0 && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                {filteredVideoGuides.length} ta
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Har bir qadam bo‘yicha qisqa video qo‘llanmalar
          </p>
        </div>

        {filteredVideoGuides.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 p-6 text-center">
            <Video className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-bold text-foreground">
              {searchQuery
                ? `"${searchQuery}" bo‘yicha video topilmadi`
                : 'Bu bo‘limda hozircha video qo‘llanma yo‘q'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Kerakli ma‘lumotni quyidagi yozma qo‘llanmalardan topasiz.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVideoGuides.map((guide) => (
              <VideoGuideCard
                key={guide.id}
                guide={guide}
                category={resolveGuideCategory(guide)}
                onPlay={(g) => setActiveVideoGuide(g)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Articles / FAQ Accordion Section */}
      <section aria-label="Batafsil maqolalar va FAQ" className="space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HelpCircle className="h-4 w-4" />
            </span>
            <h2 className="text-base font-black text-foreground sm:text-lg">
              Batafsil qo‘llanmalar & FAQ
            </h2>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
              {filteredItems.length} ta mavzu
            </span>
          </div>

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

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h3 className="mt-3 text-base font-black text-foreground">Hech narsa topilmadi</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              &quot;{searchQuery}&quot; bo‘yicha hech narsa topilmadi. Boshqa so‘z bilan qidiring yoki barcha bo‘limlarni ko‘ring.
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
      </section>

      {/* Support Contact Box */}
      <section className="rounded-3xl border border-border bg-gradient-to-br from-card to-muted/50 p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-[11px] font-black uppercase text-primary">
              Savolingizga javob topmadingizmi?
            </span>
            <h3 className="mt-2 text-lg font-black text-foreground sm:text-xl">
              Qo‘llab-quvvatlashga yozing
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm leading-relaxed">
              Savol, taklif yoki shikoyatingiz bo‘lsa, qo‘llab-quvvatlash chatiga yozing yoki rasmiy Telegram va Instagram sahifalarimizga murojaat qiling.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/support?category=SUPPORT"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground shadow-card transition hover:bg-primary/90"
            >
              <Headphones className="h-4 w-4" />
              Chat orqali yozish
            </Link>
            <a
              href={siteConfig.links.telegramChannel}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              <TelegramIcon className="h-4 w-4 text-[#24A1DE]" />
              Telegram kanal
            </a>
            <a
              href={siteConfig.links.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              <Send className="h-4 w-4 text-[#229ED9]" />
              Telegram bot
            </a>
            <a
              href={siteConfig.links.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              <InstagramIcon className="h-4 w-4 text-[#E1306C]" />
              Instagram
            </a>
          </div>
        </div>
      </section>

      {/* Interactive Video Player Modal */}
      {activeVideoGuide && (
        <VideoPlayerModal
          guide={activeVideoGuide}
          category={resolveGuideCategory(activeVideoGuide)}
          onClose={() => setActiveVideoGuide(null)}
        />
      )}
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
        // Yopishqoq header /help#<id> dan kelgan maqola sarlavhasini yopmasin.
        'group scroll-mt-24 rounded-2xl border transition-all duration-200',
        expanded
          ? 'border-primary/40 bg-card shadow-sm ring-1 ring-primary/20'
          : 'border-border bg-card/60 hover:border-border/80 hover:bg-card',
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
              <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-black uppercase text-warning">
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
            'grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180 bg-primary/10 text-primary',
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
