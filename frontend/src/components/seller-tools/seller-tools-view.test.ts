// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SellerToolsView } from "./seller-tools-view";
const id = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
const row = {
  id,
  title: "Saqlangan javob",
  body: "Private preserved text",
  chatId: null,
  listingId: null,
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
};
let host: HTMLDivElement;
let root: Root;
let status = "AVAILABLE";
let writeStatus = 200;
const fetcher = vi.fn();
beforeEach(() => {
  status = "AVAILABLE";
  writeStatus = 200;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: vi.fn(),
  });
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/capabilities"))
      return Response.json({
        tools: status,
        bulk: status,
        profileDecoration: status,
        bulkLimit: 1,
      });
    if (url.endsWith("/export"))
      return Response.json({
        templates: [row, { ...row, id: id2 }],
        notes: [],
      });
    if (url.endsWith("/listings/bulk"))
      return Response.json({
        results: [
          { listingId: id, success: false, code: "account_link_changed" },
        ],
      });
    if (init?.method && init.method !== "GET")
      return writeStatus === 200
        ? Response.json(row)
        : Response.json(
            {
              code:
                writeStatus === 403 ? "upgrade_required" : "plan_unavailable",
            },
            { status: writeStatus },
          );
    const page = Number(
      new URL(url, "https://test").searchParams.get("page") || 0,
    );
    if (url.includes("/listings/me"))
      return Response.json({
        content: [
          { id, description: "Own listing", status: "ACTIVE" },
          { id: id2, description: "Second own", status: "ACTIVE" },
        ],
        page,
        size: 50,
        totalElements: 2,
      });
    return Response.json({
      content: [
        url.includes("/notes")
          ? { ...row, title: "Shaxsiy qayd", listingId: id }
          : row,
      ],
      page,
      size: 50,
      totalElements: page ? 51 : 51,
    });
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetcher.mockReset();
});
async function mount(props = {}) {
  await act(async () => root.render(createElement(SellerToolsView, props)));
}
function button(label: string) {
  const b = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  expect(b, label).toBeTruthy();
  return b!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function input(label: string, value: string) {
  const el = host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
  expect(el).toBeTruthy();
  await act(async () => {
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("retains Free private notes/templates, paginates, and exports the complete dataset independently", async () => {
  status = "DENIED";
  await mount({ listingId: id });
  expect(host.textContent).toContain("Private preserved text");
  expect(host.textContent).toContain("faqat siz");
  expect(button("Saqlash").disabled).toBe(true);
  expect(host.querySelector('a[href="/plans"]')).toBeTruthy();
  await click("Javob shablonlari");
  await click("Keyingi shablonlar");
  expect(
    fetcher.mock.calls.some(([url]) => url.includes("/templates?page=1")),
  ).toBe(true);
  await click("JSON eksport");
  expect(
    fetcher.mock.calls.some(([url]) => url.endsWith("/seller-tools/export")),
  ).toBe(true);
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
it.each([403, 503])(
  "revokes all saved-data writes after %s while retaining readable content",
  async (code) => {
    await mount({ listingId: id });
    await input("Sarlavha", "New");
    await input("Matn", "New body");
    writeStatus = code;
    await click("Saqlash");
    expect(host.textContent).toContain("Private preserved text");
    expect(button("Saqlash").disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')).toBeTruthy();
    expect(host.textContent).toContain(code === 403 ? "Pro" : "aniqlanmadi");
  },
);
it("uses the service bulk limit, exact decimal string and per-listing partial errors", async () => {
  await mount();
  const boxes = host.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  expect(boxes.length).toBe(2);
  await act(async () => boxes[0].click());
  expect(boxes[1].disabled).toBe(true);
  const op = host.querySelector(
    '[aria-label="Ommaviy amal"]',
  ) as HTMLSelectElement;
  await act(async () => {
    op.value = "PRICE";
    op.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await input("Yangi narx", "9007199254740993.12");
  await click("Tanlanganlarga qo‘llash");
  const call = fetcher.mock.calls.find(([url]) =>
    url.endsWith("/listings/bulk"),
  );
  expect(JSON.parse(call![1].body)).toEqual({
    operation: "PRICE",
    listingIds: [id],
    price: "9007199254740993.12",
  });
  expect(host.textContent).toContain(
    "Akkountning e’longa bog‘lanishi o‘zgargan",
  );
  expect(
    fetcher.mock.calls.filter(([url]) => url.includes("/listings/me")).length,
  ).toBeGreaterThan(1);
  await click("Yangilash");
  expect(host.textContent).toContain(
    "Akkountning e’longa bog‘lanishi o‘zgargan",
  );
});
it("rejects arbitrary context IDs without requesting a private note filter", async () => {
  await mount({ chatId: "https://evil.test", listingId: "invalid" });
  expect(host.textContent).toContain("Kontekst yaroqsiz");
  expect(
    fetcher.mock.calls.every(
      ([url]) =>
        !url.includes("evil.test") && !url.includes("listingId=invalid"),
    ),
  ).toBe(true);
});
it("recovers disappearing final pages and keeps failed outcomes after another success", async () => {
  const normal = fetcher.getMockImplementation()!;
  let deleted = false;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/capabilities"))
      return Response.json({
        tools: "AVAILABLE",
        bulk: "AVAILABLE",
        profileDecoration: "AVAILABLE",
        bulkLimit: 3,
      });
    if (url.includes("/templates?page=1") && deleted)
      return Response.json({
        content: [],
        page: 1,
        size: 50,
        totalElements: 1,
      });
    if (url.endsWith("/listings/bulk")) {
      const ids = JSON.parse(init!.body as string).listingIds;
      return Response.json({
        results: ids.map((listingId: string, index: number) => ({
          listingId,
          success: index === 0,
          code: index === 0 ? "ok" : "listing_not_active",
        })),
      });
    }
    return normal(url, init);
  });
  await mount();
  await click("Keyingi shablonlar");
  deleted = true;
  await click("Yangilash");
  expect(fetcher.mock.calls.at(-1)?.[0] ?? "").toBeTruthy();
  expect(host.textContent).toContain("1-sahifa");
  const boxes = host.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  await act(async () => {
    boxes[0].click();
    boxes[1].click();
  });
  await click("Tanlanganlarga qo‘llash");
  expect(host.textContent).toContain("Own listing: Bajarildi");
  expect(host.textContent).toContain("Second own: Bajarilmadi");
  expect(host.textContent).toContain("E’lon endi faol emas");
  await click("Yangilash");
  expect(host.textContent).toContain("Second own: Bajarilmadi");
});
it("refresh failure closes stale write grants while retaining saved data and supports retry", async () => {
  vi.useFakeTimers();
  try {
    await mount();
    expect(button("Saqlash").disabled).toBe(false);
    const normal = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url: string, init?: RequestInit) =>
      url.includes("/capabilities")
        ? Promise.reject(new Error("offline"))
        : normal(url, init),
    );
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(button("Saqlash").disabled).toBe(true);
    expect(host.textContent).toContain("Private preserved text");
    fetcher.mockImplementation(normal);
    await click("Yangilash");
    expect(button("Saqlash").disabled).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
it("creates plain text templates, edits with full replacement and deletes only after explicit action", async () => {
  await mount();
  await input("Sarlavha", "My reply");
  await input("Matn", "<script>plain text</script>");
  await click("Saqlash");
  let calls = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(JSON.parse(calls.at(-1)![1].body)).toEqual({
    title: "My reply",
    body: "<script>plain text</script>",
    chatId: null,
    listingId: null,
  });
  await click("Tahrirlash");
  await input("Matn", "Changed");
  await click("Saqlash");
  calls = fetcher.mock.calls.filter(([, init]) => init?.method === "PUT");
  expect(JSON.parse(calls.at(-1)![1].body)).toMatchObject({
    title: row.title,
    body: "Changed",
    chatId: null,
    listingId: null,
  });
  await click("Tahrirlash");
  await click("O‘chirish");
  expect(
    fetcher.mock.calls.find(([, init]) => init?.method === "DELETE")![0],
  ).toBe(`/api/marketplace/v1/seller-tools/templates/${id}`);
  expect(host.querySelector("script")).toBeNull();
});
