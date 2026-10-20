'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Download, Eye, Heart, MessageCircle, Package, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { analyticsExport, analyticsReport, analyticsSummary, AnalyticsRequestError } from '@/lib/seller-analytics-client';
import { ANALYTICS_DAYS, canReadAnalytics, formatAnalyticsDate, formatGrossSales, type AnalyticsCapabilities, type AnalyticsDays, type AnalyticsMetrics, type AnalyticsReport, type AnalyticsSummary } from '@/lib/seller-analytics';

const UNKNOWN: AnalyticsCapabilities = { status: 'UNAVAILABLE', historyDays: 0, exportEnabled: false };
const PANEL = 'rounded-2xl border border-border bg-card p-4 sm:p-5';
const CELL = 'px-4 py-3 text-right tabular-nums';
const message = (error: unknown) => error instanceof Error && !(error instanceof TypeError) ? error.message : 'Tarmoq xatoligi. Qayta urinib ko‘ring.';

function Stat({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return <div className="min-w-0 rounded-xl border border-border bg-card p-4">
    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{icon}{label}</p>
    <p className="mt-2 break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">{value}</p>
  </div>;
}
function MetricCells({ metrics }: { metrics: AnalyticsMetrics }) {
  return <><td className={CELL}>{formatCompactNumber(metrics.uniqueViews)}</td><td className={CELL}>{formatCompactNumber(metrics.saveAdditions)}</td><td className={CELL}>{formatCompactNumber(metrics.inquiries)}</td><td className={CELL}>{formatCompactNumber(metrics.completedTrades)}</td><td className={`${CELL} whitespace-nowrap`}>{formatGrossSales(metrics.grossSalesUzs)}</td></>;
}
function MetricHeaders() {
  return <><th scope="col" className={CELL}>Birinchi ko‘rishlar</th><th scope="col" className={CELL}>Saqlashlar</th><th scope="col" className={CELL}>So‘rovlar</th><th scope="col" className={CELL}>Yakunlangan savdolar</th><th scope="col" className={CELL}>Yalpi savdo summasi</th></>;
}

export function SellerAnalyticsView() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [override, setOverride] = useState<AnalyticsCapabilities | null>(null);
  const [query, setQuery] = useState<{ days: AnalyticsDays; listingId?: string; title?: string; page: number }>({ days: 90, page: 0 });
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const exportController = useRef<AbortController | null>(null);
  const capabilities = override ?? summary?.capabilities ?? UNKNOWN;

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setSummaryLoading(true); setSummaryError(null); setReportError(null);
    analyticsSummary(controller.signal).then(data => {
      if (!active) return;
      setSummary(data); setOverride(null);
      const supported = [...ANALYTICS_DAYS].reverse().find(days => canReadAnalytics(data.capabilities, days));
      if (supported) setQuery(previous => canReadAnalytics(data.capabilities, previous.days) ? previous : { ...previous, days: supported, page: 0 });
    }).catch(error => {
      if (!active) return;
      setSummaryError(message(error)); setOverride(UNKNOWN); setReport(null);
    }).finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setReport(null); setReportLoading(false);
    if (!summary || summaryLoading || !canReadAnalytics(capabilities, query.days)) return () => controller.abort();
    setReportLoading(true); setReportError(null);
    analyticsReport(query, controller.signal).then(data => { if (active) setReport(data); }).catch(error => {
      if (!active) return;
      setReportError(message(error));
      if (error instanceof AnalyticsRequestError && (error.status === 403 || error.status === 503)) {
        setOverride(error.code === 'analytics_upgrade_required' ? { status: 'DENIED', historyDays: 0, exportEnabled: false } : UNKNOWN);
      }
    }).finally(() => { if (active) setReportLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [summary, summaryLoading, capabilities, query]);

  useEffect(() => () => { generation.current++; exportController.current?.abort(); }, []);
  function invalidate() {
    generation.current++; exportController.current?.abort(); setExporting(false); setDownloadNotice(null); setReport(null); setReportError(null);
  }
  function retry() {
    invalidate(); setSummaryLoading(true);
    setQuery(previous => ({ ...previous, page: 0 }));
    setReload(value => value + 1);
  }
  function changeQuery(next: typeof query) { invalidate(); setQuery(next); }

  async function download() {
    const controller = new AbortController(); exportController.current?.abort(); exportController.current = controller;
    const current = generation.current;
    setExporting(true); setReportError(null); setDownloadNotice(null);
    try {
      const blob = await analyticsExport(query, controller.signal);
      if (controller.signal.aborted || current !== generation.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        link.href = url; link.download = `seller-analytics-${query.days}days.csv`; document.body.append(link); link.click();
        setDownloadNotice('CSV yuklandi. Faylda tanlangan filtrdagi barcha e’lonlar bor.');
      } finally { link.remove(); URL.revokeObjectURL(url); }
    } catch (error) {
      if (controller.signal.aborted || current !== generation.current) return;
      setReportError(message(error));
      if (error instanceof AnalyticsRequestError && (error.status === 403 || error.status === 503)) {
        setReport(null); setOverride(error.code === 'analytics_upgrade_required' ? { status: 'DENIED', historyDays: 0, exportEnabled: false } : UNKNOWN);
      }
    } finally { if (!controller.signal.aborted && current === generation.current) setExporting(false); }
  }

  const coverage = report?.coverage ?? summary?.coverage;
  return <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5 pb-8">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><BarChart3 aria-hidden className="h-4 w-4" />E’lonlaringiz natijasi</p>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Sotuvchi hisoboti</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">O‘zingizga tegishli faol va sotilgan e’lonlar bo‘yicha statistika.</p>
      </div>
      <Button type="button" variant="outline" onClick={retry} disabled={summaryLoading}><RefreshCw aria-hidden />Yangilash</Button>
    </header>

    {summaryError && <div role="alert" className={`${PANEL} border-destructive/40`}><p>{summaryError}</p><Button className="mt-3" variant="outline" onClick={retry}>Qayta urinish</Button></div>}
    {summaryLoading && <p role="status" className="text-sm text-muted-foreground">Statistika yuklanmoqda…</p>}
    {summary && <section aria-label="Asosiy statistika" className="space-y-3">
      <div><h2 className="font-bold">Asosiy statistika</h2><p className="text-xs text-muted-foreground">Barcha tariflarda mavjud. Davr filtri bu jami sonlarni o‘zgartirmaydi.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="E’lonlar" value={formatCompactNumber(summary.listingCount)} icon={<Package aria-hidden className="h-4 w-4 shrink-0" />} />
        <Stat label="Birinchi ko‘rishlar" value={formatCompactNumber(summary.uniqueViews)} icon={<Eye aria-hidden className="h-4 w-4 shrink-0" />} />
        <Stat label="Joriy sevimlilar" value={formatCompactNumber(summary.currentFavorites)} icon={<Heart aria-hidden className="h-4 w-4 shrink-0" />} />
        <Stat label="Akkount so‘rovlari" value={formatCompactNumber(summary.inquiries)} icon={<MessageCircle aria-hidden className="h-4 w-4 shrink-0" />} />
      </div>
    </section>}

    {coverage && <aside className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      <p>Ma’lumot yig‘ish boshlangan sana: <strong className="text-foreground">{formatAnalyticsDate(coverage.collectionStartedAt)}</strong> · {coverage.timezone}</p>
      {coverage.historyPartial && <p className="mt-1">Tarix qisman: saqlashlar va savdolar yig‘ish boshlangan sanadan hisoblanadi. Oldingi barcha kunlar uchun to‘liq tarix hali mavjud emas.</p>}
    </aside>}

    {summary && !summaryError && <section aria-label="Davr hisoboti" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold">Davr hisoboti</h2><p className="text-xs text-muted-foreground">Asia/Samarkand sanalari bo‘yicha</p></div>
        <div role="group" aria-label="Hisobot davri" className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {ANALYTICS_DAYS.map(days => <Button key={days} type="button" variant={query.days === days ? 'default' : 'ghost'} className="min-w-16 px-3" aria-pressed={query.days === days} disabled={summaryLoading || !canReadAnalytics(capabilities, days)} onClick={() => changeQuery({ ...query, days, page: 0 })}>{days} kun</Button>)}
        </div>
      </div>
      {reportError && <div role="alert" className={`${PANEL} border-destructive/40`}><p>{reportError}</p><Button variant="outline" className="mt-3" onClick={retry}>Qayta urinish</Button></div>}
      {capabilities.status === 'DENIED' && <div className={PANEL}>
        <h3 className="font-bold">Pro bilan tarix va CSV</h3><p className="mt-2 text-sm text-muted-foreground">Pro tarifida 90 kungacha mavjud tarix, e’lonlar kesimidagi hisobot va CSV eksportini oching. Tarixning boshlanishi yig‘ish sanasiga bog‘liq.</p>
        <Button asChild className="mt-4"><Link href="/plans">Pro imkoniyatlarini ko‘rish</Link></Button>
        {!reportError && <Button variant="ghost" className="mt-4 sm:ml-2" onClick={retry}>Qayta urinish</Button>}
      </div>}
      {capabilities.status === 'UNAVAILABLE' && <div className={PANEL}><p className="font-semibold">Hisobot imkoniyati aniqlanmadi</p><p className="mt-1 text-sm text-muted-foreground">Tarif holatini hozir tekshirib bo‘lmadi. Asosiy statistika saqlanadi.</p>{!reportError && <Button variant="outline" className="mt-3" onClick={retry}>Qayta urinish</Button>}</div>}
      {capabilities.status === 'AVAILABLE' && <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{query.title ?? 'Barcha e’lonlar'}</p><p className="text-xs text-muted-foreground">CSV tanlangan davr va filtrdagi barcha e’lonlarni oladi.</p></div>
          <Button type="button" variant="outline" disabled={summaryLoading || exporting || !capabilities.exportEnabled || !canReadAnalytics(capabilities, query.days)} onClick={download}><Download aria-hidden />{exporting ? 'CSV tayyorlanmoqda…' : 'CSV yuklash'}</Button>
        </div>
        {query.listingId && <Button variant="outline" onClick={() => changeQuery({ days: query.days, page: 0 })}>Barcha e’lonlar</Button>}
        {downloadNotice && <p role="status" className="text-sm text-muted-foreground">{downloadNotice}</p>}
        {reportLoading && <p role="status" className="text-sm text-muted-foreground">Hisobot yuklanmoqda…</p>}
        {!ANALYTICS_DAYS.some(days => canReadAnalytics(capabilities, days)) && <p className={PANEL}>Joriy imkoniyatda 7, 30 yoki 90 kunlik davr mavjud emas.</p>}
        {report && <>
          <p className="text-sm text-muted-foreground">{formatAnalyticsDate(report.fromDate)} – {formatAnalyticsDate(report.toDate)} · {query.days} kun</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Birinchi ko‘rishlar" value={formatCompactNumber(report.totals.uniqueViews)} />
            <Stat label="Saqlashlar qo‘shilishi" value={formatCompactNumber(report.totals.saveAdditions)} />
            <Stat label="Birinchi so‘rovlar" value={formatCompactNumber(report.totals.inquiries)} />
            <Stat label="Yakunlangan savdolar" value={formatCompactNumber(report.totals.completedTrades)} />
          </div>
          <div className={PANEL}><p className="text-xs text-muted-foreground">Yalpi savdo summasi</p><p className="mt-1 break-words text-xl font-bold sm:text-2xl">{formatGrossSales(report.totals.grossSalesUzs)}</p><p className="mt-1 text-xs text-muted-foreground">Yakunlangan sotuvlardagi kelishilgan summa.</p></div>
          <div role="region" aria-label="Kunlik statistika jadvali, gorizontal aylantirish mumkin" tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <table className="w-full min-w-[760px] text-sm"><caption className="p-4 text-left font-bold text-foreground">Kunlik natijalar</caption><thead className="border-y border-border bg-muted/40 text-xs text-muted-foreground"><tr><th scope="col" className="px-4 py-3 text-left">Sana</th><MetricHeaders /></tr></thead><tbody className="divide-y divide-border">{report.daily.map(day => <tr key={day.date}><th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-medium">{formatAnalyticsDate(day.date)}</th><MetricCells metrics={day} /></tr>)}</tbody></table>
            {!report.daily.length && <p className="p-4 text-sm text-muted-foreground">Tanlangan davrda ma’lumot hali yo‘q.</p>}
          </div>
          <div role="region" aria-label="E’lonlar statistikasi jadvali, gorizontal aylantirish mumkin" tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <table className="w-full min-w-[820px] text-sm"><caption className="p-4 text-left font-bold text-foreground">E’lonlar bo‘yicha natijalar</caption><thead className="border-y border-border bg-muted/40 text-xs text-muted-foreground"><tr><th scope="col" className="px-4 py-3 text-left">E’lon / holat</th><MetricHeaders /></tr></thead><tbody className="divide-y divide-border">{report.listings.map(row => <tr key={row.listingId}><th scope="row" className="max-w-60 px-4 py-2 text-left"><button className="min-h-11 w-full break-words text-left text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-secondary" onClick={() => changeQuery({ days: query.days, listingId: row.listingId, title: row.title, page: 0 })}>{row.title}</button><span className="block text-xs font-normal text-muted-foreground">{row.status === 'SOLD' ? 'Sotilgan' : 'Faol'}</span></th><MetricCells metrics={row} /></tr>)}</tbody></table>
            {!report.listings.length && <p className="p-4 text-sm text-muted-foreground">{query.listingId ? 'Bu davrda e’lon bo‘yicha natija yo‘q.' : 'Hozircha e’lon yo‘q. Faol yoki sotilgan e’lonlaringiz shu yerda ko‘rinadi.'}</p>}
          </div>
          {report.totalListings > report.size && <nav aria-label="E’lonlar hisoboti sahifalari" className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" disabled={query.page === 0} onClick={() => changeQuery({ ...query, page: query.page - 1 })}>Oldingi</Button><p className="text-sm text-muted-foreground">{formatCompactNumber(query.page + 1)} / {formatCompactNumber(Math.ceil(report.totalListings / report.size))} sahifa</p><Button variant="outline" disabled={(query.page + 1) * report.size >= report.totalListings} onClick={() => changeQuery({ ...query, page: query.page + 1 })}>Keyingi</Button></nav>}
        </>}
      </>}
    </section>}
    <section className={PANEL} aria-labelledby="analytics-definitions"><h2 id="analytics-definitions" className="font-bold">Ko‘rsatkichlar nimani anglatadi?</h2>
      <dl className="mt-3 space-y-3 text-sm text-muted-foreground">
        <div><dt className="font-semibold text-foreground">Ko‘rishlar</dt><dd>Har e’lon va foydalanuvchining birinchi noyob ko‘rishi. Har kungi takroriy kirish qayta sanalmaydi. Mavjud eski ko‘rish tarixi ham hisobga olinadi.</dd></div>
        <div><dt className="font-semibold text-foreground">Sevimlilar va saqlashlar</dt><dd>Asosiy kartada joriy sevimlilar soni. Davr hisobotida yig‘ish boshlanganidan keyingi sevimliga qo‘shishlar; bu joriy son yoki sof o‘zgarish emas.</dd></div>
        <div><dt className="font-semibold text-foreground">Akkount so‘rovlari</dt><dd>Har e’lon va so‘rovchi uchun birinchi haqiqiy akkount so‘rovi. Chatni ochish so‘rov hisoblanmaydi. Mavjud so‘rov tarixi saqlanadi.</dd></div>
        <div><dt className="font-semibold text-foreground">Savdolar va summa</dt><dd>Faqat platformada yakunlangan savdolar. Yalpi summa — pulga sotilgan akkount uchun kelishilgan summa, sof foyda emas. Inson admin tasdiqlagan savdoda bu hamyon tasdiqlagan to‘lov degani emas. Obmen yalpi summaga 0 so‘m qo‘shadi.</dd></div>
      </dl>
    </section>
  </div>;
}
