"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { StickyNote } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatListingDate } from "@/lib/marketplace-format";
import {
  revokedStatus,
  toolRows,
  toolsCapabilities,
  toolsRequest,
  type ToolRow,
  type ToolStatus,
} from "@/lib/seller-tools-client";

export function ChatNotesDialog({
  chatId,
  disabled,
}: {
  chatId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<ToolRow[] | null>(null);
  const [status, setStatus] = useState<ToolStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError("");
    void Promise.all([
      toolsCapabilities(controller.signal),
      toolRows("notes", 0, { chatId }, controller.signal),
    ])
      .then(([caps, page]) => {
        if (controller.signal.aborted) return;
        setStatus(caps.tools);
        setNotes(page.content);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Qaydlar olinmadi.");
      });
    return () => controller.abort();
  }, [open, chatId, reload]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  async function save() {
    if (busy || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await toolsRequest("/seller-tools/notes", {
        method: "POST",
        body: JSON.stringify({
          title: "",
          body: draft,
          chatId,
          listingId: null,
        }),
      });
      setDraft("");
      setReload((n) => n + 1);
    } catch (err) {
      const revoked = revokedStatus(err);
      if (revoked) setStatus(revoked);
      setError(err instanceof Error ? err.message : "Qayd saqlanmadi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root open={open && !disabled} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="px-3 text-xs text-muted-foreground"
          disabled={disabled}
          aria-label="Shaxsiy qaydlar"
        >
          <StickyNote size={15} aria-hidden />
          Qaydlar
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg sm:p-6">
          <Dialog.Title className="text-base font-semibold">
            Shaxsiy qaydlar
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Faqat siz ko‘rasiz. Suhbatdoshga yuborilmaydi.
          </Dialog.Description>
          {status === "AVAILABLE" && (
            <form
              className="mt-4 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Textarea
                aria-label="Yangi qayd"
                className="min-h-24"
                maxLength={8000}
                placeholder="Bu suhbat haqida eslatma…"
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={busy || !draft.trim()}>
                  Saqlash
                </Button>
              </div>
            </form>
          )}
          {status === "DENIED" && (
            <p className="mt-4 text-sm text-muted-foreground">
              Yangi qayd yozish Pro’da mavjud.{" "}
              <Link href="/plans" className="font-medium text-primary">
                Pro tarifini ko‘rish
              </Link>
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {!notes && !error && (
            <p role="status" className="mt-4 text-sm text-muted-foreground">
              Yuklanmoqda…
            </p>
          )}
          {notes && notes.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Bu suhbatda hali qayd yo‘q.
            </p>
          )}
          {notes && notes.length > 0 && (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {notes.map((note) => (
                <li key={note.id} className="py-3">
                  {note.title && (
                    <h3 className="break-words text-sm font-semibold">
                      {note.title}
                    </h3>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {note.body}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatListingDate(note.updatedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center justify-between gap-2">
            <Link
              href={`/seller-tools?chatId=${encodeURIComponent(chatId)}`}
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
            >
              Qaydlarni boshqarish
            </Link>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost">
                Yopish
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
