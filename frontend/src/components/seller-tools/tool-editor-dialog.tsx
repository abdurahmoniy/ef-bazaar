"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ToolKind, ToolRow } from "@/lib/seller-tools-client";
import type { ListingResponse } from "@/lib/marketplace-types";

const FIELD_LABEL = "block text-sm font-medium";

export function ToolEditorDialog({
  kind,
  row,
  title,
  body,
  listingId,
  chatScoped,
  listingScoped,
  listings,
  writable,
  busy,
  error,
  onTitle,
  onBody,
  onListing,
  onSave,
  onClose,
}: {
  kind: ToolKind;
  row: ToolRow | null;
  title: string;
  body: string;
  listingId: string;
  chatScoped: boolean;
  listingScoped: boolean;
  listings: ListingResponse[];
  writable: boolean;
  busy: boolean;
  error: string;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onListing: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const notes = kind === "notes";
  const limit = notes ? 8000 : 4000;
  const dirty = title !== (row?.title ?? "") || body !== (row?.body ?? "");
  const hasContext = Boolean(row || chatScoped || listingScoped || listingId);
  const canSave =
    writable &&
    !busy &&
    body.trim().length > 0 &&
    (notes ? hasContext : title.trim().length > 0);
  const heading = row
    ? notes
      ? "Qaydni tahrirlash"
      : "Shablonni tahrirlash"
    : notes
      ? "Yangi qayd"
      : "Yangi shablon";
  const guard = (event: Event) => {
    if (dirty || busy) event.preventDefault();
  };
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          onEscapeKeyDown={guard}
          onInteractOutside={guard}
          className="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg sm:p-6"
        >
          <Dialog.Title className="text-base font-semibold">
            {heading}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {notes
              ? "Qaydni faqat siz ko‘rasiz."
              : "Shablon chatda xabar maydoniga qo‘shiladi."}
          </Dialog.Description>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave) onSave();
            }}
          >
            {notes && !row && !chatScoped && !listingScoped && (
              <label className={FIELD_LABEL}>
                E’lon
                <select
                  aria-label="Qayd uchun e’lon"
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"
                  value={listingId}
                  disabled={busy}
                  onChange={(event) => onListing(event.target.value)}
                >
                  <option value="">E’lonni tanlang</option>
                  {listings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {listing.description.slice(0, 70) || listing.id}
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block text-xs font-normal text-muted-foreground">
                  Chatga oid qaydni suhbat ichidagi «Qaydlar» tugmasidan
                  qo‘shing.
                </span>
              </label>
            )}
            <div>
              <label htmlFor="tool-title" className={FIELD_LABEL}>
                Sarlavha{notes ? " (ixtiyoriy)" : ""}
              </label>
              <Input
                id="tool-title"
                aria-label="Sarlavha"
                className="mt-1.5"
                maxLength={120}
                disabled={busy}
                value={title}
                onChange={(event) => onTitle(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="tool-body" className={FIELD_LABEL}>
                Matn
              </label>
              <Textarea
                id="tool-body"
                aria-label="Matn"
                className="mt-1.5 min-h-40"
                maxLength={limit}
                disabled={busy}
                value={body}
                onChange={(event) => onBody(event.target.value)}
              />
              <span className="mt-1 block text-right text-xs text-muted-foreground">
                {body.length} / {limit}
              </span>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={onClose}
              >
                Bekor qilish
              </Button>
              <Button type="submit" disabled={!canSave}>
                Saqlash
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
