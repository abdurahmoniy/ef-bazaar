'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, ImagePlus, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';

import { TelegramEditor } from '@/components/admin/telegram-editor';
import { TelegramPreview } from '@/components/admin/telegram-preview';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CAPTION_MAX_LENGTH,
  captionLength,
  effectiveLimit,
  removeBotBanner,
  updateBotWelcomeText,
  uploadBotBanner,
  type BotSettings,
} from '@/lib/bot-settings';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { cn } from '@/lib/utils';

interface AdminBotSettingsProps {
  initial: BotSettings;
}

export function AdminBotSettings({ initial }: AdminBotSettingsProps) {
  const [settings, setSettings] = useState(initial);
  const [text, setText] = useState(initial.welcomeText);
  // Belgi DB'da saqlanmaydi — u `bannerFileId != null` ning aksi. Shunda
  // "belgi yoqilgan, lekin banner yo'q" degan yarim holat bazaga tushmaydi.
  const [bannerEnabled, setBannerEnabled] = useState(initial.bannerFileId !== null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const length = useMemo(() => captionLength(text), [text]);
  // Chegara belgidan olinadi, saqlangan bannerdan emas: admin belgini
  // yoqishi bilan tor chegara amal qilsin, matnni yozib bo'lgandan keyin
  // "sig'madi" degan xabar chiqmasin.
  const limit = effectiveLimit(bannerEnabled);
  const overLimit = length > limit;
  const dirty = text !== settings.welcomeText;
  const bannerUrl = settings.bannerFileId ? listingMediaUrl(settings.bannerFileId) : null;

  function flash(message: string) {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 4000);
  }

  async function run(action: () => Promise<BotSettings>, done: string, busy: (v: boolean) => void) {
    setError(null);
    setSuccess(null);
    busy(true);
    try {
      const updated = await action();
      setSettings(updated);
      setBannerEnabled(updated.bannerFileId !== null);
      flash(done);
      return updated;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Amal bajarilmadi');
      return null;
    } finally {
      busy(false);
    }
  }

  async function handleSave() {
    const updated = await run(
      () => updateBotWelcomeText(text),
      'Matn saqlandi. Bot darhol yangi matnga o’tdi.',
      setSaving,
    );
    if (updated) setText(updated.welcomeText);
  }

  async function handleBannerPick(file: File | undefined) {
    if (!file) return;
    await run(() => uploadBotBanner(file), 'Banner yangilandi.', setUploading);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleBannerToggle(next: boolean) {
    if (next) {
      setBannerEnabled(true);
      return;
    }
    // Belgi o'chirildi. Banner saqlangan bo'lsa uni serverdan ham olib
    // tashlaymiz — aks holda belgi o'chgan ko'rinadi, lekin bot rasm
    // yuborishda davom etardi.
    if (settings.bannerFileId) {
      await run(() => removeBotBanner(), 'Banner olib tashlandi.', setUploading);
      return;
    }
    setBannerEnabled(false);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Bot sozlamalari</h1>
          <p className="text-sm text-muted-foreground">
            Foydalanuvchi botda <code className="rounded bg-muted px-1">/start</code> bosganda
            ko&apos;radigan xabar. Saqlaganingizda bot darhol yangilanadi.
          </p>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------- Tahrirlash ---------- */}
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

          <p className="text-xs text-muted-foreground">
            Formatlash Telegramdagidek: <kbd>Ctrl+B</kbd> qalin, <kbd>Ctrl+I</kbd> kursiv,{' '}
            <kbd>Ctrl+K</kbd> havola. Nusxa ko&apos;chirilgan matn faqat matn sifatida
            qo&apos;yiladi.
          </p>

          {overLimit && (
            <p className="text-xs font-medium text-destructive">
              {bannerEnabled
                ? `Banner qo'yilganda Telegram izohni ${CAPTION_MAX_LENGTH} belgi bilan cheklaydi. Matnni qisqartiring yoki bannerni o'chiring.`
                : `Telegram xabar uchun maksimum ${limit} belgiga ruxsat beradi.`}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !dirty || overLimit} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Saqlash
            </Button>
            <Button
              variant="outline"
              onClick={() => setText(settings.welcomeText)}
              disabled={saving || !dirty}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Bekor qilish
            </Button>
          </div>
        </section>

        {/* ---------- Banner + ko'rinish ---------- */}
        <section className="space-y-3">
          <Checkbox
            checked={bannerEnabled}
            disabled={uploading}
            onChange={(e) => handleBannerToggle(e.target.checked)}
            label="Banner rasmi bilan yuborilsin"
            description={`Yoqilsa xabar rasm + izoh bo'lib ketadi va matn chegarasi ${CAPTION_MAX_LENGTH} belgiga tushadi. O'chirilsa oddiy matn yuboriladi.`}
          />

          {bannerEnabled && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              {/*
                Rasmning O'ZI bu yerda ko'rsatilmaydi — u pastdagi preview'da
                bor. Ikki marta chizilsa preview ekrandan pastga surilib
                ketadi va aynan u yerda matn bilan rasm birga qanday
                ko'rinishini baholash kerak edi.
              */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                  className="gap-2"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {bannerUrl ? 'Boshqa rasm' : 'Rasm tanlash'}
                </Button>

                {bannerUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBannerToggle(false)}
                    disabled={uploading}
                    className="gap-2 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    O&apos;chirish
                  </Button>
                )}

                <span className="text-xs text-muted-foreground">
                  {bannerUrl
                    ? 'Rasm yuklangan — pastdagi ko\u2019rinishda.'
                    : "Rasm tanlanmaguncha bot oddiy matn yuboradi."}
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                Tavsiya: 1280&times;720. Rasm Telegram media topigiga yuboriladi, bizda faqat
                uning <code>file_id</code> si saqlanadi.
              </p>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleBannerPick(e.target.files?.[0])}
          />

          <div>
            <h2 className="mb-2 text-sm font-semibold">Telegramda qanday ko&apos;rinadi</h2>
            <TelegramPreview html={text} bannerUrl={bannerEnabled ? bannerUrl : null} />
          </div>
        </section>
      </div>
    </div>
  );
}
