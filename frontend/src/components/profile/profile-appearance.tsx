"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  getAppearance,
  revokedStatus,
  toolsRequest,
  type OwnAppearance,
} from "@/lib/seller-tools-client";
import { listingMediaUrl } from "@/lib/marketplace-media";

function useAppearance(userId: string, own: boolean) {
  const request = useRef<AbortController | null>(null);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: OwnAppearance;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [, tick] = useState(0);
  const key = `${own}:${userId}`;
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      request.current?.abort();
      const current = new AbortController();
      request.current = current;
      setLoading(true);
      try {
        const data = await getAppearance(userId, current.signal, own);
        if (!disposed && !current.signal.aborted) {
          setSnapshot({ key, data });
          setError("");
        }
      } catch (err) {
        if (!disposed && !current.signal.aborted) {
          setSnapshot((previous) =>
            previous?.key === key && own
              ? {
                  key,
                  data: {
                    ...previous.data,
                    pro: false,
                    validUntil: null,
                    capability: "UNAVAILABLE",
                  },
                }
              : null,
          );
          setError(
            err instanceof Error ? err.message : "Profil bezagi olinmadi.",
          );
        }
      } finally {
        if (!disposed && !current.signal.aborted) setLoading(false);
      }
    };
    const visible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    void refresh();
    const interval = window.setInterval(visible, 30000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("profile-appearance-changed", visible);
    return () => {
      disposed = true;
      request.current?.abort();
      clearInterval(interval);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("profile-appearance-changed", visible);
    };
  }, [key, own, userId, retry]);
  const data = snapshot?.key === key ? snapshot.data : null;
  const deadline = data?.validUntil ? Date.parse(data.validUntil) : 0;
  useEffect(() => {
    if (deadline <= Date.now()) return;
    const timer = window.setTimeout(
      () => tick((n) => n + 1),
      Math.min(deadline - Date.now(), 2147483647),
    );
    return () => clearTimeout(timer);
  }, [deadline]);
  const live = Boolean(data?.pro && deadline > Date.now());
  return {
    data,
    live,
    loading,
    error,
    setError,
    update: (value: OwnAppearance) => {
      // A local write/revocation supersedes every refresh started before it.
      request.current?.abort();
      setLoading(false);
      setSnapshot({ key, data: value });
    },
    refresh: () => setRetry((n) => n + 1),
  };
}

export function ProfileAppearance({
  userId,
  own = false,
}: {
  userId: string;
  own?: boolean;
}) {
  const { data, live } = useAppearance(userId, own);
  if (!live || !data || (own && !data.coverFileId)) return null;
  const url = data.coverFileId ? listingMediaUrl(data.coverFileId) : null;
  return (
    <div className="mb-4 space-y-2">
      {url && (
        <Image
          unoptimized
          width={1200}
          height={400}
          src={url}
          alt="Profil muqovasi"
          className="h-32 w-full rounded-xl object-cover sm:h-44"
        />
      )}
      {own ? <p className="text-xs text-muted-foreground">Profil bezagi</p> : <p className="text-xs text-muted-foreground">
        <span className="mr-2 inline-flex rounded-full bg-gold-soft px-3 py-1 font-semibold text-gold-foreground">
          Pro a’zolik
        </span>
        Tarif a’zoligi; tasdiqlanganlik, ishonchlilik yoki xaridor bahosi
        belgisi emas.
      </p>}
    </div>
  );
}

export function ProfileCoverEditor() {
  const appearance = useAppearance("me", true);
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  async function change(file?: File) {
    if (busy || appearance.data?.capability !== "AVAILABLE" || !appearance.live)
      return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    appearance.setError("");
    try {
      if (file) {
        const body = new FormData();
        body.append("file", file);
        const data = await toolsRequest<OwnAppearance>(
          "/profiles/me/appearance/cover",
          { method: "PUT", body, signal: controller.signal },
        );
        if (!controller.signal.aborted) appearance.update(data);
      } else {
        await toolsRequest("/profiles/me/appearance/cover", {
          method: "DELETE",
          signal: controller.signal,
        });
        if (!controller.signal.aborted && appearance.data)
          appearance.update({ ...appearance.data, coverFileId: null });
      }
      if (!controller.signal.aborted)
        window.dispatchEvent(new Event("profile-appearance-changed"));
    } catch (err) {
      if (!controller.signal.aborted) {
        appearance.setError(
          err instanceof Error ? err.message : "Muqova saqlanmadi.",
        );
        const status = revokedStatus(err);
        if (status && appearance.data)
          appearance.update({
            ...appearance.data,
            capability: status,
            pro: false,
            validUntil: null,
          });
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const denied = appearance.data?.capability === "DENIED";
  const writable =
    appearance.data?.capability === "AVAILABLE" &&
    appearance.live &&
    !busy &&
    !appearance.loading;
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-bold">Profil muqovasi va Pro a’zolik</h2>
      <p className="text-sm text-muted-foreground">
        Muqova Pro davomida ko‘rinadi. A’zolik tasdiqlanganlik yoki sotuvchi
        bahosi hisoblanmaydi.
      </p>
      {appearance.loading && <p role="status">Yuklanmoqda…</p>}
      {appearance.data?.coverFileId && (
        <p className="break-all text-xs text-muted-foreground">
          Saqlangan muqova mavjud
          {!appearance.live && " — hozir ommaga ko‘rinmaydi."}
        </p>
      )}
      {appearance.data?.coverFileId && (
        <Image
          unoptimized
          width={1200}
          height={400}
          src={listingMediaUrl(appearance.data.coverFileId)!}
          alt="Saqlangan muqova"
          className="h-36 w-full rounded-xl object-cover"
        />
      )}
      <label className="block text-sm font-medium">
        Yangi muqova (rasm)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Yangi muqova"
          className="mt-2 block min-h-11 w-full max-w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-muted file:px-3"
          disabled={!writable}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void change(file);
            event.target.value = "";
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          variant="outline"
          disabled={!writable || !appearance.data?.coverFileId}
          onClick={() => void change()}
        >
          Muqovani olib tashlash
        </Button>
        <Button
          className="min-h-11"
          variant="outline"
          disabled={busy}
          onClick={appearance.refresh}
        >
          Qayta urinish
        </Button>
      </div>
      {appearance.error && (
        <p role="alert" className="text-sm text-destructive">
          {appearance.error}
        </p>
      )}
      {!appearance.loading && !writable && (
        <p className="text-sm text-muted-foreground">
          {denied
            ? "Muqovani o‘zgartirish uchun Pro kerak."
            : busy
              ? "Muqova saqlanmoqda…"
              : "Imkoniyat aniqlanmadi. Qayta urinib ko‘ring."}
        </p>
      )}
      {denied && (
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary dark:text-secondary"
          href="/plans"
        >
          Pro tarifini ko‘rish
        </Link>
      )}
    </section>
  );
}
