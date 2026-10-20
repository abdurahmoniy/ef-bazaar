// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getMe: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getMe: auth.getMe }));
vi.mock("@/lib/plans-server", () => ({ getMyPlanSSR: async () => null }));
vi.mock("@/components/marketplace/marketplace-shell", () => ({
  MarketplaceShell: ({ children }: { children: ReactNode }) =>
    createElement("main", null, children),
}));
vi.mock("@/components/profile/google-link-button", () => ({
  GoogleLinkButton: () => null,
}));
vi.mock("@/components/profile/link-telegram-button", () => ({
  LinkTelegramButton: () => null,
}));
vi.mock("@/components/profile/delete-account-button", () => ({
  DeleteAccountButton: () => null,
}));
import ToolsPage from "@/app/seller-tools/page";
import EditPage from "@/app/profile/edit/page";
let identity = "A";
let host: HTMLDivElement;
let root: Root;
const fetcher = vi.fn();
const id = "11111111-1111-4111-8111-111111111111",
  chatId = "22222222-2222-4222-8222-222222222222";
const row = (owner: string) => ({
  id,
  title: `${owner} private note`,
  body: `${owner} private body`,
  chatId,
  listingId: null,
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
});
const appearance = (owner: string) => ({
  pro: owner === "A",
  coverFileId: `cover-${owner}`,
  validUntil: owner === "A" ? new Date(Date.now() + 60000).toISOString() : null,
  capability: owner === "A" ? "AVAILABLE" : "DENIED",
});
beforeEach(() => {
  identity = "A";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  auth.getMe.mockImplementation(async () => ({
    id: identity,
    displayName: `Owner ${identity}`,
    telegramLinked: true,
    googleLinked: true,
    roles: [],
    createdAt: "2026-10-20T00:00:00Z",
  }));
  fetcher.mockImplementation(async (url: string) => {
    if (url.includes("/capabilities"))
      return Response.json({
        tools: "AVAILABLE",
        bulk: "AVAILABLE",
        profileDecoration: "AVAILABLE",
        bulkLimit: 2,
      });
    if (url.includes("/appearance")) return Response.json(appearance(identity));
    if (url.includes("/listings/me"))
      return Response.json({
        content: [],
        page: 0,
        size: 50,
        totalElements: 0,
      });
    return Response.json({
      content: [row(identity)],
      page: 0,
      size: 50,
      totalElements: 1,
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
  vi.clearAllMocks();
});
async function tools() {
  const page = await ToolsPage({ searchParams: Promise.resolve({ chatId }) });
  await act(async () => root.render(page));
}
async function cover() {
  const page = await EditPage();
  await act(async () => root.render(page));
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  )!;
  expect(button, label).toBeTruthy();
  await act(async () => button.click());
}
async function input(value: string) {
  const field = host.querySelector('[aria-label="Matn"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("keys the real tools route by principal, keeps same-user drafts, aborts prior writes and drops private state on account change", async () => {
  await tools();
  expect(host.textContent).toContain("A private body");
  await click("Tahrirlash");
  await input("A unsaved private draft");
  await tools();
  expect(
    (host.querySelector('[aria-label="Matn"]') as HTMLTextAreaElement).value,
  ).toBe("A unsaved private draft");
  let finish!: (value: Response) => void;
  const normal = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "PUT"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : normal(url, init),
  );
  await click("Saqlash");
  const signal = fetcher.mock.calls.find(
    ([, init]) => init?.method === "PUT",
  )![1].signal;
  identity = "B";
  await tools();
  expect(signal.aborted).toBe(true);
  expect(host.textContent).not.toContain("A private");
  expect(host.textContent).toContain("B private body");
  expect(
    (host.querySelector('[aria-label="Matn"]') as HTMLTextAreaElement).value,
  ).toBe("");
  await act(async () => finish(Response.json(row("A"))));
  expect(host.textContent).not.toContain("A private");
  expect(
    (host.querySelector('[aria-label="Matn"]') as HTMLTextAreaElement).value,
  ).toBe("");
});
it("keys the real cover editor by principal and ignores an old upload after the new account receives denied capability", async () => {
  await cover();
  expect(
    host.querySelector('img[alt="Saqlangan muqova"]')?.getAttribute("src"),
  ).toContain("cover-A");
  let finish!: (value: Response) => void;
  const normal = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "PUT"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : normal(url, init),
  );
  const field = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(field, "files", {
    value: [new File(["image"], "cover.png", { type: "image/png" })],
  });
  await act(async () =>
    field.dispatchEvent(new Event("change", { bubbles: true })),
  );
  const signal = fetcher.mock.calls.find(
    ([, init]) => init?.method === "PUT",
  )![1].signal;
  identity = "B";
  await cover();
  expect(signal.aborted).toBe(true);
  expect(
    host.querySelector('img[alt="Saqlangan muqova"]')?.getAttribute("src"),
  ).toContain("cover-B");
  expect(
    host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled,
  ).toBe(true);
  await act(async () => finish(Response.json(appearance("A"))));
  expect(
    host.querySelector('img[alt="Saqlangan muqova"]')?.getAttribute("src"),
  ).toContain("cover-B");
  expect(
    host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled,
  ).toBe(true);
});
