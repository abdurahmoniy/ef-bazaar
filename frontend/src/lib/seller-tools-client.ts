import type { ListingResponse } from "./marketplace-types";
export type ToolStatus = "AVAILABLE" | "DENIED" | "UNAVAILABLE";
export type ToolKind = "templates" | "notes";
export interface ToolsCapabilities {
  tools: ToolStatus;
  bulk: ToolStatus;
  profileDecoration: ToolStatus;
  bulkLimit: number;
}
export interface ToolRow {
  id: string;
  title: string;
  body: string;
  chatId: string | null;
  listingId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ToolInput {
  title: string;
  body: string;
  chatId?: string | null;
  listingId?: string | null;
}
export interface ToolsPage<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
}
export interface Appearance {
  pro: boolean;
  coverFileId: string | null;
  validUntil: string | null;
}
export interface OwnAppearance extends Appearance {
  capability: ToolStatus;
}
export interface BulkResult {
  listingId: string;
  success: boolean;
  code: string;
}
export const unavailableTools: ToolsCapabilities = {
  tools: "UNAVAILABLE",
  bulk: "UNAVAILABLE",
  profileDecoration: "UNAVAILABLE",
  bulkLimit: 0,
};
export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isToolStatus = (value: unknown): value is ToolStatus =>
  value === "AVAILABLE" || value === "DENIED" || value === "UNAVAILABLE";
export class ToolsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}
export function revokedStatus(error: unknown): ToolStatus | null {
  return error instanceof ToolsError &&
    error.status === 403 &&
    error.code === "upgrade_required"
    ? "DENIED"
    : error instanceof ToolsError &&
        error.status === 503 &&
        error.code === "plan_unavailable"
      ? "UNAVAILABLE"
      : null;
}
export async function toolsRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body && !(init.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(`/api/marketplace/v1${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { ...headers, ...init.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const code = typeof payload?.code === "string" ? payload.code : undefined;
    const message =
      code === "upgrade_required"
        ? "O‘zgartirish uchun Pro kerak. Saqlangan ma’lumotlarni o‘qish, eksport qilish va o‘chirish mumkin."
        : code === "plan_unavailable"
          ? "Imkoniyat aniqlanmadi. Ma’lumotlar saqlanadi; qayta urinib ko‘ring."
          : code === "invalid_context" ||
              code === "context_not_found" ||
              code === "listing_not_found"
            ? "Kontekst topilmadi yoki sizga tegishli emas."
            : code === "context_required"
              ? "Qayd uchun chat yoki o‘z e’loningizni tanlang."
              : code === "invalid_text"
                ? "Sarlavha va matn uzunligini tekshiring."
                : code === "invalid_price"
                  ? "Narx kamida 5000.00 so‘m bo‘lsin, kasr qismi 2 raqamdan oshmasin."
                  : code === "invalid_bulk"
                    ? "Tanlangan e’lonlar va amal chegarasini tekshiring."
                    : "So‘rov bajarilmadi. Qayta urinib ko‘ring.";
    throw new ToolsError(response.status, code, message);
  }
  if (response.status === 204) return undefined as T;
  if (
    !(response.headers.get("Content-Type") ?? "")
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("Server javobi yaroqsiz. Qayta urinib ko‘ring.");
  return response.json() as Promise<T>;
}
export async function toolsCapabilities(
  signal?: AbortSignal,
): Promise<ToolsCapabilities> {
  const data = await toolsRequest<ToolsCapabilities>(
    "/seller-tools/capabilities",
    { signal },
  );
  if (
    !data ||
    !isToolStatus(data.tools) ||
    !isToolStatus(data.bulk) ||
    !isToolStatus(data.profileDecoration) ||
    !Number.isSafeInteger(data.bulkLimit) ||
    data.bulkLimit < 1
  )
    return unavailableTools;
  return data;
}
function validRow(row: ToolRow) {
  return (
    row &&
    isUuid(row.id) &&
    typeof row.title === "string" &&
    typeof row.body === "string" &&
    (row.chatId === null ||
      (typeof row.chatId === "string" && isUuid(row.chatId))) &&
    (row.listingId === null ||
      (typeof row.listingId === "string" && isUuid(row.listingId))) &&
    Number.isFinite(Date.parse(row.createdAt)) &&
    Number.isFinite(Date.parse(row.updatedAt))
  );
}
export async function toolRows(
  kind: ToolKind,
  page: number,
  context: { chatId?: string; listingId?: string } = {},
  signal?: AbortSignal,
): Promise<ToolsPage<ToolRow>> {
  const query = new URLSearchParams({
    page: String(page),
    size: "50",
    ...context,
  });
  const data = await toolsRequest<ToolsPage<ToolRow>>(
    `/seller-tools/${kind}?${query}`,
    { signal },
  );
  if (
    !data ||
    !Array.isArray(data.content) ||
    !data.content.every(validRow) ||
    data.page !== page ||
    data.size !== 50 ||
    !Number.isSafeInteger(data.totalElements) ||
    data.totalElements < 0
  )
    throw new Error("Ro‘yxat javobi yaroqsiz.");
  return data;
}
export async function toolsExport(signal?: AbortSignal) {
  const data = await toolsRequest<{ templates: ToolRow[]; notes: ToolRow[] }>(
    "/seller-tools/export",
    { signal },
  );
  if (
    !data ||
    !Array.isArray(data.templates) ||
    !Array.isArray(data.notes) ||
    !data.templates.every(validRow) ||
    !data.notes.every(validRow)
  )
    throw new Error("Eksport javobi yaroqsiz.");
  return new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
}
export function downloadTools(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = "seller-tools.json";
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
export async function ownListings(
  page: number,
  signal?: AbortSignal,
): Promise<ToolsPage<ListingResponse>> {
  const data = await toolsRequest<ToolsPage<ListingResponse>>(
    `/listings/me?page=${page}&size=50`,
    { signal },
  );
  if (
    !data ||
    !Array.isArray(data.content) ||
    data.page !== page ||
    data.size !== 50 ||
    !Number.isSafeInteger(data.totalElements) ||
    data.totalElements < 0 ||
    !data.content.every(
      (row) => row && isUuid(row.id) && typeof row.description === "string",
    )
  )
    throw new Error("E’lonlar javobi yaroqsiz.");
  return data;
}
export function validBulkPrice(price: string) {
  if (!/^\d{1,17}(\.\d{1,2})?$/.test(price)) return false;
  const [whole, fraction = ""] = price.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) >= 500000n;
}
export function appendTemplate(draft: string, body: string): string | null {
  const next = draft ? `${draft}\n${body}` : body;
  return next.length <= 4000 ? next : null;
}
export async function getAppearance(
  userId: string,
  signal?: AbortSignal,
  own = false,
): Promise<OwnAppearance> {
  const data = await toolsRequest<OwnAppearance>(
    `/profiles/${own ? "me" : encodeURIComponent(userId)}/appearance`,
    { signal },
  );
  if (
    !data ||
    typeof data.pro !== "boolean" ||
    !(data.coverFileId === null || typeof data.coverFileId === "string") ||
    !(
      data.validUntil === null ||
      (typeof data.validUntil === "string" &&
        Number.isFinite(Date.parse(data.validUntil)))
    ) ||
    (own && !isToolStatus(data.capability))
  )
    throw new Error("Profil bezagi javobi yaroqsiz.");
  return data;
}
