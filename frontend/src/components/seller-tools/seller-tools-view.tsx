"use client";
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
  type ToolsCapabilities,
  type ToolsPage,
} from "@/lib/seller-tools-client";
import type { ListingResponse } from "@/lib/marketplace-types";

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
  const exportRequest = useRef<AbortController | null>(null);
  useEffect(() => () => exportRequest.current?.abort(), []);
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      capRequest.current?.abort();
      const controller = new AbortController();
      capRequest.current = controller;
      setLoading(true);
      setCaps(unavailableTools);
      try {
        const data = await toolsCapabilities(controller.signal);
        if (!disposed && !controller.signal.aborted) {
          setCaps(data);
          setCapError("");
        }
      } catch (err) {
        if (!disposed && !controller.signal.aborted) {
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
  const denied = caps.tools === "DENIED" || caps.bulk === "DENIED";
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-20">
      <header className="space-y-3">
        <h1 className="text-xl font-bold sm:text-2xl">Sotuvchi vositalari</h1>
        <p className="text-sm text-muted-foreground">
          Shaxsiy qaydlar, javob shablonlari va o‘z e’lonlaringiz uchun amallar.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11"
            variant="outline"
            onClick={() => setRevision((n) => n + 1)}
          >
            Yangilash
          </Button>
          <Button
            className="min-h-11"
            variant="outline"
            disabled={exporting}
            onClick={() => void exportAll()}
          >
            JSON eksport
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Eksport barcha saqlangan qayd va shablonlarni oladi, sahifalashdan
          mustaqil.
        </p>
      </header>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          Kontekst yaroqsiz. Chat yoki o‘z e’loningizdagi havoladan qayting.
        </p>
      )}
      {loading ? (
        <p role="status">Imkoniyatlar yuklanmoqda…</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {caps.tools === "AVAILABLE"
            ? "Shablon va qaydlarni boshqarish mavjud."
            : caps.tools === "DENIED"
              ? "Saqlangan ma’lumotlarni o‘qish va eksport ochiq; tahrirlash uchun Pro kerak."
              : "Imkoniyat aniqlanmadi. O‘qish va eksport ochiq; pullik amallar vaqtincha yopiq."}{" "}
          {caps.bulk === "AVAILABLE"
            ? "Ommaviy amallar mavjud."
            : caps.bulk === "DENIED"
              ? "Ommaviy amallar uchun Pro kerak."
              : "Ommaviy amallar imkoniyati aniqlanmadi."}
        </p>
      )}
      {denied && (
        <Link
          href="/plans"
          className="inline-flex min-h-11 items-center font-semibold text-primary"
        >
          Pro tarifini ko‘rish
        </Link>
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
      <ToolsDataPanel
        key={`${context.chatId ?? ""}:${context.listingId ?? ""}`}
        writable={caps.tools === "AVAILABLE" && !loading}
        context={context}
        listings={listings?.content ?? []}
        onError={onError}
        revision={revision}
      />
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
  );
}
