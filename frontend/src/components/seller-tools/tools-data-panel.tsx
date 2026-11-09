"use client";
import { MessageCircle, Plus, Tag } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToolEditorDialog } from "./tool-editor-dialog";
import { formatListingDate } from "@/lib/marketplace-format";
import {
  toolRows,
  toolsRequest,
  type ToolInput,
  type ToolKind,
  type ToolRow,
  type ToolsPage,
} from "@/lib/seller-tools-client";
import type { ListingResponse } from "@/lib/marketplace-types";

const COPY = {
  templates: {
    intro: "Chatda bir bosishda qo‘shiladigan tayyor javoblar.",
    create: "Yangi shablon",
    emptyTitle: "Hali shablon yo‘q",
    empty: "Tez-tez yozadigan javoblaringizni saqlab qo‘ying.",
    plural: "shablonlar",
  },
  notes: {
    intro: "Bu qaydlarni faqat siz ko‘rasiz. Suhbatdoshga yuborilmaydi.",
    create: "Yangi qayd",
    emptyTitle: "Hali qayd yo‘q",
    empty: "Xaridor yoki e’lon haqida o‘zingizga eslatma yozing.",
    plural: "qaydlar",
  },
} as const;

const isLong = (body: string) =>
  body.length > 220 || body.split("\n").length > 3;

export function ToolsDataPanel({
  kind,
  writable,
  context,
  listings,
  onError,
  revision,
}: {
  kind: ToolKind;
  writable: boolean;
  context: { chatId?: string; listingId?: string };
  listings: ListingResponse[];
  onError: (err: unknown) => void;
  revision: number;
}) {
  const copy = COPY[kind];
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ToolsPage<ToolRow> | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [scoped, setScoped] = useState(true);
  const [editor, setEditor] = useState<{ row: ToolRow | null } | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [listingId, setListingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  const chatId = kind === "notes" && scoped ? context.chatId : undefined;
  const filterListing =
    kind === "notes" && scoped ? context.listingId : undefined;

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    const filter = {
      ...(chatId ? { chatId } : {}),
      ...(filterListing ? { listingId: filterListing } : {}),
    };
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
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Ro‘yxat olinmadi.");
      });
    return () => controller.abort();
  }, [kind, page, reload, revision, chatId, filterListing]);

  function openEditor(row: ToolRow | null) {
    setConfirmingId(null);
    setFormError("");
    setTitle(row?.title ?? "");
    setBody(row?.body ?? "");
    setListingId(row?.listingId ?? "");
    setEditor({ row });
  }

  async function run(
    request: (signal: AbortSignal) => Promise<unknown>,
    showError: (message: string) => void,
    done: () => void,
  ) {
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    try {
      await request(controller.signal);
      if (!controller.signal.aborted) {
        done();
        setReload((n) => n + 1);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        showError(err instanceof Error ? err.message : "Amal bajarilmadi.");
        onError(err);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function save() {
    if (!writable || busy || !editor) return;
    const row = editor.row;
    const input: ToolInput = {
      title: title.trim(),
      body,
      chatId: kind === "notes" ? (row ? row.chatId : (chatId ?? null)) : null,
      listingId:
        kind === "notes"
          ? row
            ? row.listingId
            : chatId
              ? null
              : (filterListing ?? (listingId || null))
          : null,
    };
    setFormError("");
    void run(
      (signal) =>
        toolsRequest(`/seller-tools/${kind}${row ? `/${row.id}` : ""}`, {
          method: row ? "PUT" : "POST",
          body: JSON.stringify(input),
          signal,
        }),
      setFormError,
      () => setEditor(null),
    );
  }

  function remove(row: ToolRow) {
    if (busy) return;
    setError("");
    void run(
      (signal) =>
        toolsRequest(`/seller-tools/${kind}/${row.id}`, {
          method: "DELETE",
          signal,
        }),
      (message) => {
        setConfirmingId(null);
        setError(message);
      },
      () => setConfirmingId(null),
    );
  }

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function clearScope() {
    setScoped(false);
    setPage(0);
    setData(null);
  }

  const scopeLabel = chatId
    ? "Shu chatga oid qaydlar"
    : filterListing
      ? "Shu e’longa oid qaydlar"
      : null;
  const listingName = (id: string) =>
    listings.find((l) => l.id === id)?.description.slice(0, 40) || "E’lon";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">
          {copy.intro}
        </p>
        {writable && (
          <Button onClick={() => openEditor(null)}>
            <Plus size={16} aria-hidden />
            {copy.create}
          </Button>
        )}
      </div>
      {scopeLabel && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-border pl-3 text-sm">
          <span>{scopeLabel}</span>
          <Button variant="link" className="h-11 px-0" onClick={clearScope}>
            Barcha qaydlar
          </Button>
        </div>
      )}
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button variant="link" className="h-11 px-0" onClick={() => setReload((n) => n + 1)}>
            Qayta yuklash
          </Button>
        </div>
      )}
      {!data && !error && (
        <div className="space-y-2" role="status" aria-label="Yuklanmoqda">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      )}
      {data && data.content.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium">{copy.emptyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.empty}</p>
        </div>
      )}
      {data && data.content.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.content.map((row) => (
            <li key={row.id} className="p-4">
              {row.title && (
                <h3 className="break-words text-sm font-semibold">
                  {row.title}
                </h3>
              )}
              <p
                className={`whitespace-pre-wrap break-words text-sm text-muted-foreground ${row.title ? "mt-1" : ""} ${expanded.has(row.id) ? "" : "line-clamp-3"}`}
              >
                {row.body}
              </p>
              {isLong(row.body) && (
                <Button
                  variant="link"
                  className="h-11 px-0 text-xs"
                  onClick={() => toggle(row.id)}
                >
                  {expanded.has(row.id) ? "Yig‘ish" : "Davomi"}
                </Button>
              )}
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>{formatListingDate(row.updatedAt)}</span>
                  {row.chatId && !chatId && (
                    <Link
                      href={`/chats/${row.chatId}`}
                      className="inline-flex min-h-11 items-center gap-1 hover:text-foreground"
                    >
                      <MessageCircle size={13} aria-hidden />
                      Chatni ochish
                    </Link>
                  )}
                  {row.listingId && !filterListing && (
                    <Link
                      href={`/marketplace/${row.listingId}`}
                      className="inline-flex min-h-11 min-w-0 items-center gap-1 hover:text-foreground"
                    >
                      <Tag size={13} aria-hidden />
                      <span className="truncate">{listingName(row.listingId)}</span>
                    </Link>
                  )}
                </div>
                <div className="flex items-center">
                  {confirmingId === row.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => remove(row)}
                      >
                        Ha, o‘chirish
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => setConfirmingId(null)}
                      >
                        Bekor qilish
                      </Button>
                    </>
                  ) : (
                    <>
                      {writable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => openEditor(row)}
                        >
                          Tahrirlash
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11 text-muted-foreground"
                        disabled={busy}
                        onClick={() => setConfirmingId(row.id)}
                      >
                        O‘chirish
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.totalElements > 50 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={page === 0 || busy}
            onClick={() => setPage((n) => n - 1)}
          >
            Oldingi {copy.plural}
          </Button>
          <span className="text-sm text-muted-foreground">{page + 1}-sahifa</span>
          <Button
            variant="outline"
            disabled={(page + 1) * 50 >= data.totalElements || busy}
            onClick={() => setPage((n) => n + 1)}
          >
            Keyingi {copy.plural}
          </Button>
        </div>
      )}
      {editor && (
        <ToolEditorDialog
          kind={kind}
          row={editor.row}
          title={title}
          body={body}
          listingId={listingId}
          chatScoped={Boolean(chatId)}
          listingScoped={Boolean(filterListing)}
          listings={listings}
          writable={writable}
          busy={busy}
          error={formError}
          onTitle={setTitle}
          onBody={setBody}
          onListing={setListingId}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
