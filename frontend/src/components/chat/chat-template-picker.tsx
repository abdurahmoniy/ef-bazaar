"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  appendTemplate,
  toolRows,
  type ToolRow,
  type ToolsPage,
} from "@/lib/seller-tools-client";

export function ChatTemplatePicker({
  draft,
  disabled,
  onInsert,
}: {
  draft: string;
  disabled: boolean;
  onInsert: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ToolsPage<ToolRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    void toolRows("templates", page, {}, controller.signal)
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
          setError(err instanceof Error ? err.message : "Shablonlar olinmadi.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, page, retry]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <Dialog.Root
      open={open && !disabled}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setPage(0);
          setError("");
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          type="button"
          className="min-h-11"
          variant="outline"
          disabled={disabled}
          aria-label="Javob shablonini tanlash"
        >
          Shablon
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
          <Dialog.Title className="font-bold">
            Javob shablonini tanlash
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            Shablon joriy qoralamaga qo‘shiladi. Yuborishni o‘zingiz
            tasdiqlaysiz. Saqlangan shablonlar Free’da ham ishlaydi.
          </Dialog.Description>
          {loading && <p role="status">Yuklanmoqda…</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {data && (
            <>
              <ul className="space-y-2">
                {data.content.map((row) => (
                  <li key={row.id}>
                    <Button
                      className="h-auto min-h-11 w-full justify-start whitespace-normal break-words text-left"
                      variant="outline"
                      type="button"
                      onClick={() => {
                        if (disabled) return;
                        const next = appendTemplate(draft, row.body);
                        if (next === null) {
                          setError(
                            "Jami matn 4000 belgidan oshadi. Qoralamani qisqartiring.",
                          );
                          return;
                        }
                        onInsert(next);
                        setOpen(false);
                      }}
                    >
                      {row.title}
                    </Button>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {row.body}
                    </p>
                  </li>
                ))}
              </ul>
              {data.content.length === 0 && <p>Saqlangan shablon yo‘q.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="min-h-11"
                  variant="outline"
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Oldingi
                </Button>
                <span className="text-xs">{page + 1}-sahifa</span>
                <Button
                  className="min-h-11"
                  type="button"
                  variant="outline"
                  disabled={(page + 1) * 50 >= data.totalElements}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Keyingi
                </Button>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {error && (
              <Button
                className="min-h-11"
                variant="outline"
                type="button"
                onClick={() => setRetry((n) => n + 1)}
              >
                Qayta urinish
              </Button>
            )}
            <Dialog.Close asChild>
              <Button className="min-h-11" type="button" variant="outline">
                Yopish
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
