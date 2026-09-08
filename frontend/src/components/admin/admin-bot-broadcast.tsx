'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, History, ImagePlus, Loader2, Send, Trash2 } from 'lucide-react';

import { InlineButtonBuilder } from '@/components/admin/inline-button-builder';
import { TelegramEditor } from '@/components/admin/telegram-editor';
import { useEmojiPacks } from '@/lib/use-emoji-packs';
import { TelegramPreview } from '@/components/admin/telegram-preview';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { BroadcastHistory } from '@/components/admin/broadcast-history';
import { RecipientPicker } from '@/components/admin/recipient-picker';
import {
  isActive,
  sendBroadcast,
  type BroadcastAudience,
  type InlineButtonRows,
  type RecipientUser,
} from '@/lib/bot-broadcast';
import { CAPTION_MAX_LENGTH, captionLength, effectiveLimit } from '@/lib/bot-settings';
import { cn } from '@/lib/utils';

const AUDIENCE_OPTIONS: Array<{ value: BroadcastAudience; label: string; hint: string }> = [
  { value: 'ALL', label: 'Hammaga', hint: 'Barcha foydalanuvchilar' },
  { value: 'USERS', label: 'Faqat userlarga', hint: 'Adminlarsiz' },
  { value: 'ADMINS', label: 'Faqat adminlarga', hint: 'Sinov uchun' },
];

/**
 * Ommaviy xabar kompozitori.
 *
 * <p>YUBORILGAN XABARNI QAYTARIB BO'LMAYDI. Panel shu haqiqat atrofida
 * qurilgan: tasdiqlash oynasi majburiy, auditoriyani adminlar bilan
 * cheklab sinov qilish mumkin, va yuborilgan har xabar tarixda qoladi.
 */
export function AdminBotBroadcast() {
  const emoji = useEmojiPacks();
  const [text, setText] = useState('');
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [banner, setBanner] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [buttons, setButtons] = useState<InlineButtonRows>([]);
  const [audience, setAudience] = useState<BroadcastAudience>('ALL');
  const [recipients, setRecipients] = useState<RecipientUser[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
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

  async function confirmSend() {
    setError(null);
    setSending(true);
    try {
      const created = await sendBroadcast({
        messageText: text,
        buttons,
        audience,
        recipientTelegramIds: recipients.map((u) => u.telegramId),
        banner: bannerEnabled ? banner : null,
      });
      setConfirming(false);
      setShowHistory(true);
      setSentNotice(
        isActive(created.status)
          ? 'Jo’natish boshlandi. Borishi quyidagi tarixda ko’rinadi.'
          : 'Jo’natish yakunlandi.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yuborib bo’lmadi');
      setConfirming(false);
    } finally {
      setSending(false);
    }
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
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {sentNotice && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{sentNotice}</span>
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

          <TelegramEditor
            value={text}
            onChange={setText}
            emojiPacks={emoji.packs}
            emojiUrls={emoji.thumbnailUrls}
          />

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
              emojiUrls={emoji.fileUrls}
              html={text}
              bannerUrl={bannerEnabled ? bannerUrl : null}
              buttons={buttons}
            />
          </div>

          {/* ---------- Kimga ---------- */}
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Kimga yuborilsin</h3>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {AUDIENCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={audience === 'SELECTED'}
                  onClick={() => setAudience(option.value)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition disabled:opacity-40',
                    audience === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/40',
                  )}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>

            {audience === 'ADMINS' && (
              <p className="text-xs text-muted-foreground">
                Sinov rejimi: xabar faqat adminlarga boradi. Haqiqiy jo&apos;natishdan oldin
                shu bilan tekshirib olish mumkin.
              </p>
            )}

            <Checkbox
              checked={audience === 'SELECTED'}
              onChange={(e) => {
                setAudience(e.target.checked ? 'SELECTED' : 'ALL');
                if (!e.target.checked) setRecipients([]);
              }}
              label="Aniq foydalanuvchilarni tanlash"
              description="Ogohlantirish va shunga o'xshash maxsus xabarlar uchun. Yoqilsa yuqoridagi guruhlar o'chadi."
            />

            {audience === 'SELECTED' && (
              <RecipientPicker selected={recipients} onChange={setRecipients} />
            )}
          </div>

          <Button
            onClick={() => setConfirming(true)}
            disabled={
              sending ||
              overLimit ||
              !text.trim() ||
              (audience === 'SELECTED' && recipients.length === 0)
            }
            className="w-full gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Yuborish
          </Button>
        </section>
      </div>

      {/* ---------- Tasdiqlash ---------- */}
      {confirming && (
        <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-destructive">
                {audience === 'SELECTED'
                  ? `${recipients.length} ta foydalanuvchiga yuborilsinmi?`
                  : `${AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label} yuborilsinmi?`}
              </p>
              {/*
                Tasdiqlash oynasini olib tashlab bo'lmaydi: yuborilgan xabarni
                ommaviy ravishda qaytarish imkoni yo'q, ya'ni bu bosish
                jarayondagi yagona qaytarib bo'lmaydigan qadam.
              */}
              <p className="text-muted-foreground">
                Yuborilgan xabarni qaytarib bo&apos;lmaydi.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmSend} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Ha, yuborilsin
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={sending}>
              Bekor qilish
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Tarix ---------- */}
      <div className="space-y-3">
        <Button
          variant="outline"
          onClick={() => setShowHistory((v) => !v)}
          className="gap-2"
        >
          <History className="h-4 w-4" />
          {showHistory ? 'Tarixni yashirish' : 'Yuborilgan xabarlar'}
        </Button>
        {showHistory && <BroadcastHistory />}
      </div>
    </div>
  );
}
