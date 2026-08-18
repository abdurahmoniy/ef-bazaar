'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Percent,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { updateTradeCommissionConfig } from '@/lib/payment-admin-client';
import type { TradeCommissionConfig } from '@/lib/payment-types';
import { getTelegramWebApp } from '@/lib/telegram';
import { telegramHaptic } from '@/lib/telegram-shell';
import { sellerProceedsSom, tradeFeeSom } from '@/lib/trade-commission';
import { cn } from '@/lib/utils';

interface AdminCommissionFormProps {
  initialConfig: TradeCommissionConfig;
}

export function AdminCommissionForm({ initialConfig }: AdminCommissionFormProps) {
  const [config, setConfig] = useState<TradeCommissionConfig>(initialConfig);
  const [bandSom, setBandSom] = useState(String(initialConfig.bandSom));
  const [lowRatePercent, setLowRatePercent] = useState(String(initialConfig.lowRatePercent));
  const [highRatePercent, setHighRatePercent] = useState(String(initialConfig.highRatePercent));
  const [lowMinSom, setLowMinSom] = useState(String(initialConfig.lowMinSom));
  const [highMinSom, setHighMinSom] = useState(String(initialConfig.highMinSom));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Test sandbox calculator
  const [testPrice, setTestPrice] = useState('500000');

  // Preview config built from currently typed values
  const previewConfig: TradeCommissionConfig = {
    id: config.id,
    bandSom: Math.max(1000, Number(bandSom) || 100000),
    lowRatePercent: Math.max(0, Math.min(100, Number(lowRatePercent) || 0)),
    highRatePercent: Math.max(0, Math.min(100, Number(highRatePercent) || 0)),
    lowMinSom: Math.max(0, Number(lowMinSom) || 0),
    highMinSom: Math.max(0, Number(highMinSom) || 0),
    active: true,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };

  const parsedTestPrice = Number(testPrice) || 0;
  const simulatedFee = tradeFeeSom(parsedTestPrice, previewConfig);
  const simulatedProceeds = sellerProceedsSom(parsedTestPrice, previewConfig);
  const isBelowBand = parsedTestPrice < previewConfig.bandSom;
  const effectiveRate = parsedTestPrice > 0 ? ((simulatedFee / parsedTestPrice) * 100).toFixed(1) : '0';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const b = Number(bandSom);
    const lr = Number(lowRatePercent);
    const hr = Number(highRatePercent);
    const lm = Number(lowMinSom);
    const hm = Number(highMinSom);

    if (isNaN(b) || b < 1000) {
      setError("Chegara summasi kamida 1 000 so'm bo'lishi kerak");
      return;
    }
    if (isNaN(lr) || lr < 0 || lr > 100) {
      setError("Pastki foiz stavkasi 0 dan 100 gacha bo'lishi kerak");
      return;
    }
    if (isNaN(hr) || hr < 0 || hr > 100) {
      setError("Yuqori foiz stavkasi 0 dan 100 gacha bo'lishi kerak");
      return;
    }
    if (isNaN(lm) || lm < 0 || isNaN(hm) || hm < 0) {
      setError("Minimal summalar 0 dan kam bo'lishi mumkin emas");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateTradeCommissionConfig({
        bandSom: b,
        lowRatePercent: lr,
        highRatePercent: hr,
        lowMinSom: lm,
        highMinSom: hm,
      });
      setConfig(updated);
      setSuccess(true);
      telegramHaptic(getTelegramWebApp(), 'success', false);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err?.message || "Komissiyani yangilashda xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setBandSom(String(config.bandSom));
    setLowRatePercent(String(config.lowRatePercent));
    setHighRatePercent(String(config.highRatePercent));
    setLowMinSom(String(config.lowMinSom));
    setHighMinSom(String(config.highMinSom));
    setError(null);
    setSuccess(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Column: Configuration Form */}
      <div className="space-y-4 lg:col-span-7">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
                <Percent className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-black text-foreground">Smart Admin Komissiyasi</h2>
                <p className="text-xs text-muted-foreground">Savdolarda ushlab qolinadigan platforma xizmat haqi</p>
              </div>
            </div>
            {config.updatedAt && (
              <span className="text-[11px] font-semibold text-muted-foreground hidden sm:inline">
                Yangilangan: {new Date(config.updatedAt).toLocaleDateString('uz-UZ')}
              </span>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs font-bold text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Komissiya stavkalari muvaffaqiyatli saqlandi va barcha yangi savdolarda darhol kuchga kirdi!</span>
              </div>
            )}

            {/* 1. Band Threshold */}
            <div className="space-y-1.5 rounded-xl border border-border/80 bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="bandSom" className="text-xs font-bold">
                  Stavka o&apos;zgarish chegarasi (so&apos;m)
                </Label>
                <span className="text-xs font-black text-primary">
                  {formatPriceUZS(Number(bandSom) || 0)}
                </span>
              </div>
              <Input
                id="bandSom"
                type="number"
                inputMode="numeric"
                min={1000}
                step="any"
                value={bandSom}
                onChange={(e) => setBandSom(e.target.value)}
                className="h-10 rounded-xl font-bold text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Ushbu summagacha pastki stavka, ushbu summadan boshlab yuqori stavka qo&apos;llaniladi.
              </p>
            </div>

            {/* 2. Low Tier (< Band) */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/20 text-[10px] text-primary">1</span>
                Kichik savdolar uchun (&lt; {formatPriceUZS(Number(bandSom) || 0)})
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="lowRatePercent" className="text-[11px] font-bold text-muted-foreground">
                    Komissiya foizi (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="lowRatePercent"
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={lowRatePercent}
                      onChange={(e) => setLowRatePercent(e.target.value)}
                      className="h-9 rounded-xl pr-7 text-xs font-black"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="lowMinSom" className="text-[11px] font-bold text-muted-foreground">
                    Minimal summa (floor, so&apos;m)
                  </Label>
                  <Input
                    id="lowMinSom"
                    type="number"
                    min="0"
                    step="any"
                    value={lowMinSom}
                    onChange={(e) => setLowMinSom(e.target.value)}
                    className="h-9 rounded-xl text-xs font-black"
                  />
                </div>
              </div>
            </div>

            {/* 3. High Tier (>= Band) */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/20 text-[10px] text-primary">2</span>
                Katta savdolar uchun (&ge; {formatPriceUZS(Number(bandSom) || 0)})
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="highRatePercent" className="text-[11px] font-bold text-muted-foreground">
                    Komissiya foizi (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="highRatePercent"
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={highRatePercent}
                      onChange={(e) => setHighRatePercent(e.target.value)}
                      className="h-9 rounded-xl pr-7 text-xs font-black"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="highMinSom" className="text-[11px] font-bold text-muted-foreground">
                    Minimal summa (floor, so&apos;m)
                  </Label>
                  <Input
                    id="highMinSom"
                    type="number"
                    min="0"
                    step="any"
                    value={highMinSom}
                    onChange={(e) => setHighMinSom(e.target.value)}
                    className="h-9 rounded-xl text-xs font-black"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={saving}
                className="h-9 rounded-xl gap-1 text-xs font-bold"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Bekor qilish
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="h-9 rounded-xl gap-1.5 bg-primary px-4 text-xs font-black text-primary-foreground shadow-sm transition hover:opacity-90"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saqlanmoqda...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Stavkalarni saqlash
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Column: Live Interactive Sandbox / Calculator */}
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/5 via-card to-card p-4 sm:p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-black text-foreground">Jonli Hisob-kitob Simulyatori</h3>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">
              Real-time
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label htmlFor="testPrice" className="text-[11px] font-bold text-muted-foreground">
                Savdo narxini sinab ko&apos;rish (so&apos;m)
              </Label>
              <Input
                id="testPrice"
                type="number"
                inputMode="numeric"
                step="any"
                min="0"
                value={testPrice}
                onChange={(e) => setTestPrice(e.target.value)}
                className="h-10 rounded-xl text-sm font-black text-foreground"
              />
            </div>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1">
              {[50000, 100000, 300000, 500000, 1000000, 2000000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTestPrice(String(preset))}
                  className={cn(
                    'tap-press rounded-lg border px-2 py-0.5 text-[10px] font-bold transition',
                    parsedTestPrice === preset
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {preset >= 1000000 ? `${preset / 1000000} mln` : `${preset / 1000}k`}
                </button>
              ))}
            </div>

            {/* Simulation Results Breakdown */}
            <div className="rounded-xl border border-border bg-card p-3 space-y-2.5 pt-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Qo&apos;llaniladigan rejim:</span>
                <span className="font-bold text-foreground">
                  {isBelowBand ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      Kichik savdo ({previewConfig.lowRatePercent}%, min {formatPriceUZS(previewConfig.lowMinSom)})
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Katta savdo ({previewConfig.highRatePercent}%, min {formatPriceUZS(previewConfig.highMinSom)})
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Smart xizmat haqi:</span>
                <span className="font-black text-destructive">
                  −{formatPriceUZS(simulatedFee)} ({effectiveRate}%)
                </span>
              </div>

              <div className="border-t border-border/80 pt-2 flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Sotuvchiga tushadigan sof summa:</span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  {formatPriceUZS(simulatedProceeds)}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
              <span>
                Hisob-kitob butun sonli tiyin arifmetikasi orqali bajariladi. Har doim sotuvchi foydasiga yaxlitlanadi.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
