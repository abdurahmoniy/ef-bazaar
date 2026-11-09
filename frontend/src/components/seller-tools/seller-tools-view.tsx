"use client";
import { Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToolsDataPanel } from "./tools-data-panel";
import { ToolsBulkPanel } from "./tools-bulk-panel";
import {
  downloadTools,
  isUuid,
  ownListings,
  revokedStatus,
  toolsCapabilities,
  toolsExport,
  unavailableTools,
  type ToolKind,
  type ToolsCapabilities,
  type ToolsPage,
} from "@/lib/seller-tools-client";
import type { ListingResponse } from "@/lib/marketplace-types";

type Tab = ToolKind | "listings";
const TABS: { id: Tab; label: string }[] = [
  { id: "templates", label: "Shablonlar" },
  { id: "notes", label: "Qaydlar" },
  { id: "listings", label: "E’lonlar" },
];

export function SellerToolsView({
  chatId,
  listingId,
}: {
  chatId?: string;
  listingId?: string;
}) {
  const invalid = Boolean(
    (chatId && !isUuid(chatId)) || (listingId && !isUuid(listingId)),
  );
  const context = {
    ...(!invalid && chatId ? { chatId } : {}),
    ...(!invalid && listingId ? { listingId } : {}),
  };
  const [tab, setTab] = useState<Tab>(
    context.chatId || context.listingId ? "notes" : "templates",
  );
  const [caps, setCaps] = useState<ToolsCapabilities>(unavailableTools);
  const [capError, setCapError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<ToolsPage<ListingResponse> | null>(
    null,
  );
  const [page, setPage] = useState(0);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listRevision, setListRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const capRequest = useRef<AbortController | null>(null);
  // A background recheck keeps known grants so an open editor is never interrupted.
  const capsKnown = useRef(false);
  const exportRequest = useRef<AbortController | null>(null);
  useEffect(() => () => exportRequest.current?.abort(), []);
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      capRequest.current?.abort();
      const controller = new AbortController();
      capRequest.current = controller;
      if (!capsKnown.current) {
        setLoading(true);
        setCaps(unavailableTools);
      }
      try {
        const data = await toolsCapabilities(controller.signal);
        if (!disposed && !controller.signal.aborted) {
          capsKnown.current = true;
          setCaps(data);
          setCapError("");
        }
      } catch (err) {
        if (!disposed && !controller.signal.aborted) {
          capsKnown.current = false;
          setCaps(unavailableTools);
          setCapError(
            err instanceof Error ? err.message : "Imkoniyat aniqlanmadi.",
          );
        }
      } finally {
        if (!disposed && !controller.signal.aborted) setLoading(false);
      }
    }
    const visible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    void refresh();
    const timer = window.setInterval(visible, 30000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      capRequest.current?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    setListError("");
    void ownListings(page, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (page > 0 && data.content.length === 0) {
          setPage(Math.max(0, Math.ceil(data.totalElements / 50) - 1));
          return;
        }
        setListings(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setListError(
            err instanceof Error ? err.message : "E’lonlar olinmadi.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    return () => controller.abort();
  }, [page, listRevision, revision]);
  function onError(err: unknown) {
    const status = revokedStatus(err);
    if (status) {
      capRequest.current?.abort();
      setLoading(false);
      setCaps({
        ...unavailableTools,
        tools: status,
        bulk: status,
        profileDecoration: status,
      });
      setCapError(err instanceof Error ? err.message : "Imkoniyat o‘zgardi.");
    }
  }
  async function exportAll() {
    exportRequest.current?.abort();
    const controller = new AbortController();
    exportRequest.current = controller;
    setExporting(true);
    setExportError("");
    try {
      const blob = await toolsExport(controller.signal);
      if (!controller.signal.aborted) downloadTools(blob);
    } catch (err) {
      if (!controller.signal.aborted)
        setExportError(
          err instanceof Error ? err.message : "Eksport olinmadi.",
        );
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  }
  const status = tab === "listings" ? caps.bulk : caps.tools;
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-20">
      <h1 className="text-xl font-semibold">Sotuvchi vositalari</h1>
      <div className="flex items-center justify-between gap-2 border-b border-border">
        <div className="flex">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`-mb-px min-h-11 border-b-2 px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                tab === id
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab !== "listings" && (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 shrink-0 text-muted-foreground"
            disabled={exporting}
            onClick={() => void exportAll()}
          >
            <Download size={15} aria-hidden />
            <span className="sr-only sm:not-sr-only">Yuklab olish</span>
          </Button>
        )}
      </div>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          Kontekst yaroqsiz. Chat yoki o‘z e’loningizdagi havoladan qayting.
        </p>
      )}
      {!loading && status !== "AVAILABLE" && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 rounded-lg bg-muted/60 px-4 py-2 text-sm">
          <p className="min-w-0 flex-1 basis-60 py-1.5">
            {status === "UNAVAILABLE"
              ? "Imkoniyat aniqlanmadi. Saqlangan ma’lumotlar joyida; o‘zgartirish vaqtincha yopiq."
              : tab === "listings"
                ? "Ommaviy amallar Pro’da mavjud."
                : "Saqlangan ma’lumotlarni o‘qish, eksport va o‘chirish ochiq. Yangi qo‘shish va tahrirlash Pro’da."}
          </p>
          {status === "DENIED" ? (
            <Link
              href="/plans"
              className="inline-flex min-h-11 items-center font-medium text-primary"
            >
              Pro tarifini ko‘rish
            </Link>
          ) : (
            <Button
              variant="link"
              className="h-11 px-0"
              onClick={() => setRevision((n) => n + 1)}
            >
              Qayta urinish
            </Button>
          )}
        </div>
      )}
      {capError && (
        <p role="alert" className="text-sm text-destructive">
          {capError}
        </p>
      )}
      {exportError && (
        <p role="alert" className="text-sm text-destructive">
          {exportError}
        </p>
      )}
      {tab !== "listings" && (
        <ToolsDataPanel
          key={`${tab}:${context.chatId ?? ""}:${context.listingId ?? ""}`}
          kind={tab}
          writable={caps.tools === "AVAILABLE" && !loading}
          context={context}
          listings={listings?.content ?? []}
          onError={onError}
          revision={revision}
        />
      )}
      <div hidden={tab !== "listings"}>
        <ToolsBulkPanel
          data={listings}
          page={page}
          setPage={setPage}
          loading={listLoading}
          error={listError}
          reload={() => setListRevision((n) => n + 1)}
          writable={caps.bulk === "AVAILABLE" && !loading}
          limit={caps.bulkLimit}
          onError={onError}
        />
      </div>
    </div>
  );
}
