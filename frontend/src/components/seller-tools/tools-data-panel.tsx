"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  toolRows,
  toolsRequest,
  type ToolInput,
  type ToolKind,
  type ToolRow,
  type ToolsPage,
} from "@/lib/seller-tools-client";
import type { ListingResponse } from "@/lib/marketplace-types";

export function ToolsDataPanel({
  writable,
  context,
  listings,
  onError,
  revision,
}: {
  writable: boolean;
  context: { chatId?: string; listingId?: string };
  listings: ListingResponse[];
  onError: (err: unknown) => void;
  revision: number;
}) {
  const [kind, setKind] = useState<ToolKind>(
    context.chatId || context.listingId ? "notes" : "templates",
  );
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ToolsPage<ToolRow> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<ToolRow | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [listingId, setListingId] = useState(context.listingId ?? "");
  const [busy, setBusy] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  const chatId = context.chatId;
  const filterListing = context.listingId;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const filter =
      kind === "notes"
        ? {
            ...(chatId ? { chatId } : {}),
            ...(filterListing ? { listingId: filterListing } : {}),
          }
        : {};
    void toolRows(kind, page, filter, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (page > 0 && result.content.length === 0) {
          setPage(Math.max(0, Math.ceil(result.totalElements / 50) - 1));
          return;
        }
        setData(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Ro‘yxat olinmadi.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, page, reload, revision, chatId, filterListing]);
  function reset() {
    setEditing(null);
    setTitle("");
    setBody("");
    setListingId(context.listingId ?? "");
  }
  async function mutate(remove = false) {
    if (!writable || busy) return;
    const input: ToolInput = {
      title: title.trim(),
      body,
      chatId:
        kind === "notes" ? (editing ? editing.chatId : (chatId ?? null)) : null,
      listingId:
        kind === "notes"
          ? editing
            ? editing.listingId
            : listingId || null
          : null,
    };
    if (
      !remove &&
      (!body.trim() ||
        (kind === "templates" && !title.trim()) ||
        (kind === "notes" && !input.chatId && !input.listingId))
    ) {
      setError("Matn va kerakli sarlavha/kontekstni to‘ldiring.");
      return;
    }
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    setError("");
    try {
      await toolsRequest(
        `/seller-tools/${kind}${editing ? `/${editing.id}` : ""}`,
        {
          method: remove ? "DELETE" : editing ? "PUT" : "POST",
          ...(!remove ? { body: JSON.stringify(input) } : {}),
          signal: controller.signal,
        },
      );
      if (!controller.signal.aborted) {
        reset();
        setReload((n) => n + 1);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Saqlanmadi.");
        onError(err);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">
        {(["templates", "notes"] as const).map((value) => (
          <Button
            key={value}
            className="min-h-11"
            variant={kind === value ? "default" : "outline"}
            aria-pressed={kind === value}
            disabled={busy}
            onClick={() => {
              setKind(value);
              setPage(0);
              setData(null);
              reset();
            }}
          >
            {value === "templates" ? "Javob shablonlari" : "Shaxsiy qaydlar"}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Qaydlarni faqat siz ko‘rasiz. Ular suhbatdoshga yuborilmaydi. Saqlangan
        shablonlar va qaydlarni tarif tugagach ham o‘qish va eksport qilish
        mumkin.
      </p>
      {loading && <p role="status">Yuklanmoqda…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        className="min-h-11"
        disabled={busy || loading}
        onClick={() => setReload((n) => n + 1)}
      >
        Ro‘yxatni yangilash
      </Button>
      {!loading && data && (
        <>
          <ul className="space-y-3">
            {data.content.map((row) => (
              <li key={row.id} className="rounded-xl border border-border p-3">
                <h3 className="break-words font-semibold">
                  {row.title || "Qayd"}
                </h3>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {row.body}
                </p>
                {kind === "notes" && (
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    {row.chatId ? "Chatga oid qayd. " : ""}
                    {row.listingId ? "O‘z e’loningizga oid qayd." : ""}
                  </p>
                )}
                <Button
                  variant="outline"
                  className="mt-2 min-h-11"
                  disabled={!writable || busy}
                  onClick={() => {
                    setEditing(row);
                    setTitle(row.title);
                    setBody(row.body);
                    setListingId(row.listingId ?? "");
                  }}
                >
                  Tahrirlash
                </Button>
              </li>
            ))}
          </ul>
          {data.content.length === 0 && (
            <p>Hozircha {kind === "templates" ? "shablon" : "qayd"} yo‘q.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={page === 0 || busy}
              onClick={() => setPage((n) => n - 1)}
            >
              Oldingi {kind === "templates" ? "shablonlar" : "qaydlar"}
            </Button>
            <span className="text-sm">
              {page + 1}-sahifa · jami {data.totalElements}
            </span>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={(page + 1) * 50 >= data.totalElements || busy}
              onClick={() => setPage((n) => n + 1)}
            >
              Keyingi {kind === "templates" ? "shablonlar" : "qaydlar"}
            </Button>
          </div>
        </>
      )}
      <form
        className="space-y-3 border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void mutate();
        }}
      >
        <h3 className="font-semibold">
          {editing
            ? "Tahrirlash"
            : kind === "templates"
              ? "Yangi shablon"
              : "Yangi shaxsiy qayd"}
        </h3>
        {kind === "notes" && (
          <>
            {editing ? (
              <p className="break-all text-xs text-muted-foreground">
                Saqlangan kontekst: {editing.chatId ? "chat " : ""}
                {editing.listingId ? "e’lon" : ""}
              </p>
            ) : (
              <>
                {chatId && (
                  <p className="break-all text-xs">Joriy chatga shaxsiy qayd</p>
                )}
                <label className="block text-sm">
                  O‘z e’loningiz
                  <select
                    aria-label="Qayd uchun e’lon"
                    className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
                    value={listingId}
                    disabled={!writable || busy || Boolean(filterListing)}
                    onChange={(e) => setListingId(e.target.value)}
                  >
                    <option value="">E’lon tanlanmagan</option>
                    {filterListing &&
                      !listings.some((l) => l.id === filterListing) && (
                        <option value={filterListing}>
                          Havoladagi o‘z e’loningiz
                        </option>
                      )}
                    {listings.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.description.slice(0, 70) || l.id}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-muted-foreground">
                  Quyidagi e’lonlar sahifasidan kerakli e’lonni toping yoki
                  chatdagi «Shaxsiy qaydlar» havolasini oching.
                </p>
              </>
            )}
          </>
        )}
        <label className="block text-sm">
          Sarlavha{kind === "notes" ? " (ixtiyoriy)" : ""}
          <Input
            aria-label="Sarlavha"
            className="mt-1 min-h-11"
            maxLength={120}
            required={kind === "templates"}
            disabled={!writable || busy}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Matn
          <Textarea
            aria-label="Matn"
            className="mt-1 min-h-28"
            maxLength={kind === "templates" ? 4000 : 8000}
            required
            disabled={!writable || busy}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11"
            disabled={!writable || busy}
            type="submit"
          >
            Saqlash
          </Button>
          {editing && (
            <>
              <Button
                className="min-h-11"
                type="button"
                variant="destructive"
                disabled={!writable || busy}
                onClick={() => void mutate(true)}
              >
                O‘chirish
              </Button>
              <Button
                className="min-h-11"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={reset}
              >
                Bekor qilish
              </Button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
