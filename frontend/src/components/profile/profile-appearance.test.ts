// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfileAppearance, ProfileCoverEditor } from "./profile-appearance";
let host: HTMLDivElement;
let root: Root;
const fetcher = vi.fn();
const active = () => ({
  pro: true,
  coverFileId: "telegram-cover",
  validUntil: new Date(Date.now() + 10000).toISOString(),
  capability: "AVAILABLE",
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockImplementation(async () => Response.json(active()));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetcher.mockReset();
});
it("uses only public appearance and hides membership and cover at the mounted validity deadline", async () => {
  vi.useFakeTimers();
  await act(async () =>
    root.render(createElement(ProfileAppearance, { userId: "user-a" })),
  );
  expect(host.textContent).toContain("Pro a’zolik");
  expect(host.textContent).toContain("tasdiqlanganlik");
  expect(host.querySelector("img")?.src).toContain("/bot/photo/telegram-cover");
  expect(fetcher.mock.calls[0][0]).toContain("/profiles/user-a/appearance");
  await act(async () => vi.advanceTimersByTimeAsync(10001));
  expect(host.textContent).not.toContain("Pro a’zolik");
  expect(host.querySelector("img")).toBeNull();
});
it("aborts old identity, ignores stale public response, and cleans timers/listeners", async () => {
  let resolve!: (r: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await act(async () =>
    root.render(createElement(ProfileAppearance, { userId: "old" })),
  );
  const signal = fetcher.mock.calls[0][1].signal;
  fetcher.mockResolvedValue(
    Response.json({ pro: false, coverFileId: null, validUntil: null }),
  );
  await act(async () =>
    root.render(createElement(ProfileAppearance, { userId: "new" })),
  );
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json(active())));
  expect(host.textContent).not.toContain("Pro a’zolik");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(fetcher.mock.calls.at(-1)![0]).toContain("/profiles/new/appearance");
});
it("fails closed on refresh failure", async () => {
  await act(async () =>
    root.render(createElement(ProfileAppearance, { userId: "u" })),
  );
  expect(host.querySelector("img")).toBeTruthy();
  fetcher.mockRejectedValue(new Error("offline"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.querySelector("img")).toBeNull();
});
it("retains saved metadata on downgrade, disallows writes, and offers retry", async () => {
  fetcher.mockResolvedValue(
    Response.json({
      ...active(),
      pro: false,
      validUntil: null,
      capability: "DENIED",
    }),
  );
  await act(async () => root.render(createElement(ProfileCoverEditor)));
  expect(host.textContent).not.toContain("telegram-cover");
  expect(host.textContent).toContain("Saqlangan muqova mavjud");
  expect(host.textContent).toContain("Saqlangan");
  expect(host.querySelector("input")?.disabled).toBe(true);
  expect(host.querySelector("img")?.src).toContain("telegram-cover");
});
it("uploads one multipart file without Content-Type and preserves old metadata on failure", async () => {
  await act(async () => root.render(createElement(ProfileCoverEditor)));
  fetcher.mockResolvedValue(
    Response.json({ code: "plan_unavailable" }, { status: 503 }),
  );
  const file = new File(["image"], "cover.png", { type: "image/png" });
  const input = host.querySelector("input")!;
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  const call = fetcher.mock.calls.find(([, init]) => init.method === "PUT")!;
  expect(call).toBeTruthy();
  expect(call[1].body.getAll("file")).toHaveLength(1);
  expect(call[1].headers["Content-Type"]).toBeUndefined();
  expect(host.textContent).not.toContain("telegram-cover");
  expect(host.textContent).toContain("Saqlangan muqova mavjud");
  expect(host.querySelector("input")?.disabled).toBe(true);
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
});
it("disables all cover writes at the mounted validity deadline before polling", async () => {
  vi.useFakeTimers();
  await act(async () => root.render(createElement(ProfileCoverEditor)));
  expect(host.querySelector("input")?.disabled).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(10001));
  expect(host.querySelector("input")?.disabled).toBe(true);
  const remove = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Muqovani olib tashlash",
  )!;
  expect(remove.disabled).toBe(true);
  expect(host.textContent).toContain("hozir ommaga ko‘rinmaydi");
});
it.each([403, 503])(
  "does not restore paid controls from an older focus refresh after upload %s",
  async (status) => {
    await act(async () => root.render(createElement(ProfileCoverEditor)));
    let finishUpload!: (value: Response) => void;
    let finishRefresh!: (value: Response) => void;
    fetcher.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((resolve) => {
          if (init?.method === "PUT") finishUpload = resolve;
          else finishRefresh = resolve;
        }),
    );
    const input = host.querySelector("input")!;
    Object.defineProperty(input, "files", {
      value: [new File(["image"], "cover.png", { type: "image/png" })],
    });
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await act(async () => window.dispatchEvent(new Event("focus")));
    const refreshSignal = fetcher.mock.calls.at(-1)![1].signal;
    await act(async () =>
      finishUpload(
        Response.json(
          { code: status === 403 ? "upgrade_required" : "plan_unavailable" },
          { status },
        ),
      ),
    );
    await act(async () =>
      finishRefresh(
        Response.json({ ...active(), coverFileId: "stale-focus-cover" }),
      ),
    );
    expect(host.querySelector("input")?.disabled).toBe(true);
    expect(refreshSignal.aborted).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      status === 403 ? "Pro kerak" : "Imkoniyat aniqlanmadi",
    );
    expect(host.querySelector("img")?.getAttribute("src")).toContain(
      "telegram-cover",
    );
    expect(host.querySelector("img")?.getAttribute("src")).not.toContain(
      "stale-focus-cover",
    );
  },
);
it("keeps the newly uploaded cover when an earlier refresh resolves later", async () => {
  await act(async () => root.render(createElement(ProfileCoverEditor)));
  let finishUpload!: (value: Response) => void;
  let finishRefresh!: (value: Response) => void;
  let reads = 0;
  fetcher.mockImplementation((_url: string, init?: RequestInit) =>
    init?.method === "PUT"
      ? new Promise((resolve) => {
          finishUpload = resolve;
        })
      : ++reads === 1
        ? new Promise((resolve) => {
            finishRefresh = resolve;
          })
        : Promise.resolve(
            Response.json({ ...active(), coverFileId: "new-cover" }),
          ),
  );
  const input = host.querySelector("input")!;
  Object.defineProperty(input, "files", {
    value: [new File(["image"], "cover.png", { type: "image/png" })],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  await act(async () => window.dispatchEvent(new Event("focus")));
  const signal = fetcher.mock.calls.at(-1)![1].signal;
  await act(async () =>
    finishUpload(Response.json({ ...active(), coverFileId: "new-cover" })),
  );
  await act(async () =>
    finishRefresh(
      Response.json({ ...active(), coverFileId: "old-focus-cover" }),
    ),
  );
  expect(signal.aborted).toBe(true);
  expect(host.querySelector("img")?.getAttribute("src")).toContain("new-cover");
});
