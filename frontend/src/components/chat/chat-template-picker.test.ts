// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatTemplatePicker } from "./chat-template-picker";
let host: HTMLDivElement;
let root: Root;
const insert = vi.fn();
const fetcher = vi.fn();
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Retained Free reply",
  body: "Reply",
  chatId: null,
  listingId: null,
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockImplementation(async (url: string) =>
    Response.json({
      content: [row],
      page: url.includes("page=1") ? 1 : 0,
      size: 50,
      totalElements: 51,
    }),
  );
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
async function mount(draft = "Existing", disabled = false) {
  await act(async () =>
    root.render(
      createElement(ChatTemplatePicker, { draft, disabled, onInsert: insert }),
    ),
  );
}
async function click(label: string) {
  const node = [...document.querySelectorAll("button")].find(
    (n) => n.textContent === label || n.getAttribute("aria-label") === label,
  );
  expect(node, label).toBeTruthy();
  await act(async () => node!.click());
}
it("lazy-loads paginated retained templates with dialog focus, appends the draft and never sends", async () => {
  await mount();
  expect(fetcher).not.toHaveBeenCalled();
  await click("Javob shablonini tanlash");
  expect(
    document.querySelector('[role="dialog"]')?.contains(document.activeElement),
  ).toBe(true);
  await click("Keyingi");
  expect(fetcher.mock.calls.at(-1)![0]).toContain("page=1");
  await click("Retained Free reply");
  expect(insert).toHaveBeenCalledExactlyOnceWith("Existing\nReply");
  expect(
    fetcher.mock.calls.every(
      ([, init]) => !init.method || init.method === "GET",
    ),
  ).toBe(true);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("keeps an overlong draft and visible explanation, and disables opening during composer modes", async () => {
  await mount("x".repeat(3999));
  await click("Javob shablonini tanlash");
  await click("Retained Free reply");
  expect(insert).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "4000",
  );
  await click("Yopish");
  await mount("", true);
  expect(host.querySelector("button")?.disabled).toBe(true);
});
it("aborts a closed picker and ignores its delayed response", async () => {
  let finish!: (r: Response) => void;
  fetcher.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await click("Javob shablonini tanlash");
  const signal = fetcher.mock.calls[0][1].signal;
  await click("Yopish");
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish(
      Response.json({ content: [row], page: 0, size: 50, totalElements: 1 }),
    ),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
