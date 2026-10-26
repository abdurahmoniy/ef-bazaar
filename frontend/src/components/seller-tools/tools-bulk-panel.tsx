"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  toolsRequest,
  validBulkPrice,
  ToolsError,
  type BulkResult,
  type ToolsPage,
} from "@/lib/seller-tools-client";
import type { ListingResponse } from "@/lib/marketplace-types";

export function ToolsBulkPanel({
  data,
  page,
  setPage,
  loading,
  error,
  reload,
  writable,
  limit,
  onError,
}: {
  data: ToolsPage<ListingResponse> | null;
  page: number;
  setPage: (n: number) => void;
  loading: boolean;
  error: string;
  reload: () => void;
  writable: boolean;
  limit: number;
  onError: (error: unknown) => void;
}) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [operation, setOperation] = useState<"UNPUBLISH" | "PRICE">(
    "UNPUBLISH",
  );
  const [price, setPrice] = useState("");
  const [results, setResults] = useState<BulkResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const outcome: Record<string, string> = {
    ok: "Amal bajarildi",
    listing_not_found: "E’lon topilmadi yoki sizga tegishli emas",
    listing_not_active: "E’lon endi faol emas",
    account_archived: "Akkount arxivlangan",
    account_link_changed: "Akkountning e’longa bog‘lanishi o‘zgargan",
    upgrade_required: "Pro imkoniyati kerak",
    plan_unavailable: "Imkoniyat aniqlanmadi; qayta tekshiring",
    operation_failed: "Amal bajarilmadi; e’lonni tekshiring",
  };
  const eligible =
    writable &&
    selected.length > 0 &&
    selected.length <= limit &&
    (operation === "UNPUBLISH" || validBulkPrice(price));
  async function apply() {
    if (!eligible || busy) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setActionError("");
    try {
      const response = await toolsRequest<{ results: BulkResult[] }>(
        "/seller-tools/listings/bulk",
        {
          method: "POST",
          body: JSON.stringify({
            operation,
            listingIds: selected,
            ...(operation === "PRICE" ? { price } : {}),
          }),
          signal: current.signal,
        },
      );
      if (current.signal.aborted) return;
      if (
        !response ||
        !Array.isArray(response.results) ||
        response.results.length !== selected.length ||
        !response.results.every(
          (item, index) =>
            item.listingId === selected[index] &&
            typeof item.success === "boolean" &&
            typeof item.code === "string",
        )
      )
        throw new Error(
          "Ommaviy amal javobi yaroqsiz. Natijani yangilab tekshiring.",
        );
      setResults((previous) => [
        ...previous.filter(
          (old) =>
            !response.results.some((next) => next.listingId === old.listingId),
        ),
        ...response.results,
      ]);
      setSelected(
        response.results
          .filter((item) => !item.success)
          .map((item) => item.listingId),
      );
      const revoked = response.results.find(
        (item) =>
          item.code === "upgrade_required" || item.code === "plan_unavailable",
      );
      if (revoked)
        onError(
          new ToolsError(
            revoked.code === "upgrade_required" ? 403 : 503,
            revoked.code,
            "Imkoniyat o‘zgardi. Natijalarni tekshiring.",
          ),
        );
      reload();
    } catch (err) {
      if (!current.signal.aborted) {
        setActionError(
          err instanceof Error ? err.message : "Amal bajarilmadi.",
        );
        onError(err);
      }
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="font-bold">O‘z e’lonlaringizni boshqarish</h2>
      <p className="text-sm text-muted-foreground">
        {limit > 0 ? `Bir amalda ko‘pi bilan ${limit} ta e’lon. ` : ""}Har e’lon
        alohida tekshiriladi. Qisman xatoda muvaffaqiyatli amallar saqlanadi;
        qolganlarini tekshirib qayta tanlang.
      </p>
      {loading && <p role="status">E’lonlar yuklanmoqda…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        className="min-h-11"
        disabled={busy || loading}
        onClick={reload}
      >
        E’lonlarni yangilash
      </Button>
      {!loading && data && (
        <>
          <ul className="divide-y divide-border">
            {data.content.map((listing) => (
              <li
                key={listing.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm">
                  <input
                    className="h-5 w-5 shrink-0"
                    type="checkbox"
                    checked={selected.includes(listing.id)}
                    disabled={
                      !writable ||
                      busy ||
                      listing.status !== "ACTIVE" ||
                      (!selected.includes(listing.id) &&
                        selected.length >= limit)
                    }
                    onChange={(e) => {
                      setLabels((previous) => ({
                        ...previous,
                        [listing.id]:
                          listing.description.slice(0, 100) || "E’lon",
                      }));
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, listing.id]
                          : ids.filter((id) => id !== listing.id),
                      );
                    }}
                  />
                  <span className="break-words">
                    {listing.description.slice(0, 100) || listing.id}
                    <span className="block text-xs text-muted-foreground">
                      {listing.status === "ACTIVE"
                        ? "Faol"
                        : listing.status === "SOLD"
                          ? "Sotilgan"
                          : "Nashrdan olingan"}
                    </span>
                  </span>
                </label>
                <Link
                  className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold text-primary"
                  href={`/seller-tools?listingId=${encodeURIComponent(listing.id)}`}
                >
                  Shaxsiy qayd
                </Link>
              </li>
            ))}
          </ul>
          {data.content.length === 0 && <p>Hozircha o‘z e’lonlaringiz yo‘q.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="min-h-11"
              variant="outline"
              disabled={page === 0 || busy}
              onClick={() => setPage(page - 1)}
            >
              Oldingi e’lonlar
            </Button>
            <span className="text-sm">
              {page + 1}-sahifa · jami {data.totalElements}
            </span>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={(page + 1) * 50 >= data.totalElements || busy}
              onClick={() => setPage(page + 1)}
            >
              Keyingi e’lonlar
            </Button>
          </div>
        </>
      )}
      <p className="text-sm" role="status">
        Tanlangan: {selected.length}
        {limit > 0 ? ` / ${limit}` : ""}
      </p>
      <label className="block text-sm">
        Amal
        <select
          aria-label="Ommaviy amal"
          className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
          value={operation}
          disabled={!writable || busy}
          onChange={(e) =>
            setOperation(e.target.value as "UNPUBLISH" | "PRICE")
          }
        >
          <option value="UNPUBLISH">Nashrdan olish (akkount saqlanadi)</option>
          <option value="PRICE">Yagona narxni belgilash</option>
        </select>
      </label>
      {operation === "PRICE" && (
        <label className="block text-sm">
          Yangi narx (so‘m)
          <Input
            aria-label="Yangi narx"
            className="mt-1 min-h-11"
            inputMode="decimal"
            disabled={!writable || busy}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Kamida 5000.00 so‘m, ko‘pi bilan 2 kasr raqami. Barcha tanlangan
            e’longa shu narx qo‘llanadi.
          </span>
          {price && !validBulkPrice(price) && (
            <span role="alert" className="text-xs text-destructive">
              Narx yaroqsiz.
            </span>
          )}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={!eligible || busy || loading}
          onClick={() => void apply()}
        >
          Tanlanganlarga qo‘llash
        </Button>
        <Button
          className="min-h-11"
          variant="outline"
          disabled={busy || selected.length === 0}
          onClick={() => setSelected([])}
        >
          Tanlovni tozalash
        </Button>
      </div>
      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      {results.length > 0 && (
        <div aria-live="polite" className="space-y-2">
          <h3 className="font-semibold">Har e’lon natijasi</h3>
          {results.map((result) => (
            <p className="break-all text-sm" key={result.listingId}>
              {labels[result.listingId] ?? "Tanlangan e’lon"}:{" "}
              {result.success ? "Bajarildi" : "Bajarilmadi"} ·{" "}
              {outcome[result.code] ??
                "Natija noma’lum; e’lonni yangilab tekshiring"}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
