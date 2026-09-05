'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Save } from 'lucide-react';

import { TelegramPreview } from '@/components/admin/telegram-preview';
import { Button } from '@/components/ui/button';
import {
  POST_BLOCK_LABELS,
  moveBlock,
  previewPost,
  updatePostSettings,
  type PostBlock,
  type PostSettings as Settings,
} from '@/lib/partner-panel';

interface Props {
  settings: Settings;
  onSaved: (settings: Settings) => void;
}

/**
 * Kanaldagi post qanday ko'rinishini sozlaydi.
 *
 * <p>Preview matnini BACKEND quradi — haqiqiy postni quradigan aynan
 * o'sha kod bilan. Bu yerda qayta yozsak, hamkor preview'da bir
 * narsani ko'rib kanalda boshqasini olardi.
 */
export function PostSettingsTab({ settings, onSaved }: Props) {
  const [enabled, setEnabled] = useState<PostBlock[]>(settings.enabled);
  const [footer, setFooter] = useState(settings.footer ?? '');
  const [html, setHtml] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kechikkan javob yangisini bosib ketmasin: tez yozilganda
  // so'rovlar tartibsiz qaytadi.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      previewPost(enabled, footer.trim() || null)
        .then((text) => {
          if (id === requestId.current) setHtml(text);
        })
        .catch(() => {
          // Preview yuklanmagani sozlashni to'smaydi.
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [enabled, footer]);

  const disabled = settings.disabled.filter((b) => !enabled.includes(b));
  const allBlocks = [...enabled, ...disabled.filter((b) => !enabled.includes(b))];

  const toggle = useCallback((block: PostBlock) => {
    setSaved(false);
    setEnabled((current) =>
      current.includes(block) ? current.filter((b) => b !== block) : [...current, block],
    );
  }, []);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const panel = await updatePostSettings(enabled, footer.trim() || null);
      onSaved(panel.postSettings);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saqlanmadi');
    } finally {
      setSaving(false);
    }
  }

  const tooLong = footer.length > settings.footerLimit;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Postda nima chiqsin</h2>
        <p className="text-xs text-muted-foreground">
          Belgilanganlari chiqadi. Strelkalar bilan tartibini o&apos;zgartiring —
          ba&apos;zi kanallar tavsifni yuqorida joylashtiradi.
        </p>

        <ul className="divide-y divide-border">
          {allBlocks.map((block) => {
            const on = enabled.includes(block);
            const at = enabled.indexOf(block);
            return (
              <li key={block} className="flex items-center gap-2 py-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(block)}
                    className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                  />
                  <span className={`truncate text-sm ${on ? '' : 'text-muted-foreground'}`}>
                    {POST_BLOCK_LABELS[block]}
                  </span>
                </label>
                {/* Tartib faqat yoqilganlar orasida ma'noga ega. */}
                {on && (
                  <span className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Yuqoriga"
                      disabled={at === 0}
                      onClick={() => { setSaved(false); setEnabled((c) => moveBlock(c, at, -1)); }}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Pastga"
                      disabled={at === enabled.length - 1}
                      onClick={() => { setSaved(false); setEnabled((c) => moveBlock(c, at, 1)); }}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Post ostidagi matn</h2>
        <p className="text-xs text-muted-foreground">
          O&apos;z kanallaringiz va ishonchli adminlaringiz. Har postda chiqadi.
        </p>
        <textarea
          value={footer}
          onChange={(e) => { setSaved(false); setFooter(e.target.value); }}
          rows={6}
          placeholder={'Rasmiy Sahifalarimiz 👇\n\n🎮 | @kanalim\n🛒 | @dokonim'}
          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
        />
        <p className={`text-xs ${tooLong ? 'text-destructive' : 'text-muted-foreground'}`}>
          {footer.length} / {settings.footerLimit}
          {tooLong && ' — chegaradan oshdi, post kesilib qoladi'}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Kanalda shunday ko&apos;rinadi</h2>
        {html === null ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
          </p>
        ) : (
          <TelegramPreview
            html={html}
            bannerUrl={null}
            buttons={[[{ text: "E'lonni ochish", url: '#' }]]}
          />
        )}
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" className="w-full" disabled={saving || tooLong} onClick={save}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {saved ? 'Saqlandi' : 'Saqlash'}
      </Button>
    </div>
  );
}
