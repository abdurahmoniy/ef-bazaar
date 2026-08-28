'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ImagePlus, Info, Trash2 } from 'lucide-react';

import { InlineButtonBuilder } from '@/components/admin/inline-button-builder';
import { TelegramEditor } from '@/components/admin/telegram-editor';
import { TelegramPreview } from '@/components/admin/telegram-preview';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { InlineButtonRows } from '@/lib/bot-broadcast';
import { CAPTION_MAX_LENGTH, captionLength, effectiveLimit } from '@/lib/bot-settings';
import { cn } from '@/lib/utils';

/**
 * Ommaviy xabar kompozitori.
 *
 * <p>HOZIRCHA YUBORMAYDI. Bu bosqichda faqat xabar yig'iladi va qanday
 * ko'rinishi ko'rsatiladi — yuborish, tezlik jilovi va tarix keyingi
 * bosqichda qo'shiladi. Ketma-ketlik ataylab shunday: yuborilgan xabarni
 * qaytarib bo'lmaydi, shuning uchun avval ko'rinish tasdiqlanadi.
 */
export function AdminBotBroadcast() {
  const [text, setText] = useState('');
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [banner, setBanner] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [buttons, setButtons] = useState<InlineButtonRows>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const length = useMemo(() => captionLength(text), [text]);
  const limit = effectiveLimit(bannerEnabled);
  const overLimit = length > limit;

  // Object URL brauzer xotirasida qoladi — komponent yopilganda bo'shatamiz.
  useEffect(() => () => {
    if (bannerUrl) URL.revokeObjectURL(bannerUrl);
  }, [bannerUrl]);

  function pickBanner(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (bannerUrl) URL.revokeObjectURL(bannerUrl);
    setBanner(file);
    setBannerUrl(URL.createObjectURL(file));
    setBannerEnabled(true);
    if (fileInput.current) fileInput.current.value = '';
  }

  function toggleBanner(next: boolean) {
    setBannerEnabled(next);
    if (next) return;
    if (bannerUrl) URL.revokeObjectURL(bannerUrl);
    setBanner(null);
    setBannerUrl(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Bu bosqichda xabar faqat yig&apos;iladi. Yuborish tugmasi, jo&apos;natish tezligi
          va tarix keyingi bosqichda qo&apos;shiladi.
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------- Yozish ---------- */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Xabar matni</h2>
            <span
              className={cn(
                'font-mono text-xs',
                overLimit ? 'font-bold text-destructive' : 'text-muted-foreground',
              )}
            >
              {length} / {limit}
            </span>
          </div>

          <TelegramEditor value={text} onChange={setText} />

          {overLimit && (
            <p className="text-xs font-medium text-destructive">
              {bannerEnabled
                ? `Banner qo'yilganda Telegram izohni ${CAPTION_MAX_LENGTH} belgi bilan cheklaydi.`
                : `Telegram xabar uchun maksimum ${limit} belgiga ruxsat beradi.`}
            </p>
          )}

          <InlineButtonBuilder rows={buttons} onChange={setButtons} />
        </section>

        {/* ---------- Banner + ko'rinish ---------- */}
        <section className="space-y-3">
          <Checkbox
            checked={bannerEnabled}
            onChange={(e) => toggleBanner(e.target.checked)}
            label="Banner rasmi bilan yuborilsin"
            description={`Yoqilsa xabar rasm + izoh bo'lib ketadi va matn chegarasi ${CAPTION_MAX_LENGTH} belgiga tushadi.`}
          />

          {bannerEnabled && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                  className="gap-2"
                >
                  <ImagePlus className="h-4 w-4" />
                  {banner ? 'Boshqa rasm' : 'Rasm tanlash'}
                </Button>
                {banner && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleBanner(false)}
                    className="gap-2 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    O&apos;chirish
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  {banner ? banner.name : 'Rasm tanlanmagan'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Tavsiya: 1280&times;720.</p>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickBanner(e.target.files?.[0])}
          />

          <div>
            <h2 className="mb-2 text-sm font-semibold">Telegramda qanday ko&apos;rinadi</h2>
            <TelegramPreview
              html={text}
              bannerUrl={bannerEnabled ? bannerUrl : null}
              buttons={buttons}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
