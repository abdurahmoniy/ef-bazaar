'use client';
import { EmojiPicker } from '@/components/admin/emoji-picker';
import type { EmojiItem, EmojiPackDetail } from '@/lib/emoji-packs';
export function ChatEmojiPicker({ packs, loading, error, onPick, onClose }: {
 packs: EmojiPackDetail[]; loading: boolean; error: string | null;
 onPick: (emoji: EmojiItem) => void; onClose: () => void;
}) {
 return <div role="group" aria-label="Emoji tanlash paneli" className="mb-2 overflow-hidden rounded-2xl border border-border bg-card">
 {loading ? <p role="status" className="p-3 text-sm text-muted-foreground">Emoji yuklanmoqda…</p>
 : error ? <p role="alert" className="p-3 text-sm text-destructive">{error}</p>
 : <EmojiPicker packs={packs} onPick={onPick} onClose={onClose} />}
 </div>;
}
