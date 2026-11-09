// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatNotesDialog } from "./chat-notes-dialog";
const chatId = "22222222-2222-4222-8222-222222222222";
const note = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "",
  body: "Buyer wants a swap",
  chatId,
  listingId: null,
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
};
let host: HTMLDivElement;
let root: Root;
let tools = "AVAILABLE";
const fetcher = vi.fn();
beforeEach(() => {
  tools = "AVAILABLE";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/capabilities"))
      return Response.json({
        tools,
        bulk: tools,
        profileDecoration: tools,
        bulkLimit: 50,
      });
    if (init?.method === "POST") return Response.json(note, { status: 201 });
    return Response.json({
      content: [note],
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
  vi.unstubAllGlobals();
  fetcher.mockReset();
});
async function open() {
  await act(async () =>
    root.render(createElement(ChatNotesDialog, { chatId, disabled: false })),
  );
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Shaxsiy qaydlar"]')!
      .click(),
  );
}
const field = () =>
  document.querySelector<HTMLTextAreaElement>('[aria-label="Yangi qayd"]');
const save = () =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Saqlash",
  );
it("adds a private note without leaving the chat and scopes it to this chat", async () => {
  await open();
  expect(document.body.textContent).toContain("Buyer wants a swap");
  expect(save()!.disabled).toBe(true);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field(), "Call after 18:00");
    field()!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => save()!.click());
  const post = fetcher.mock.calls.find(([, i]) => i?.method === "POST")!;
  expect(post[0]).toBe("/api/marketplace/v1/seller-tools/notes");
  expect(JSON.parse(post[1].body)).toEqual({
    title: "",
    body: "Call after 18:00",
    chatId,
    listingId: null,
  });
  expect(field()!.value).toBe("");
  expect(
    document.querySelector(`a[href="/seller-tools?chatId=${chatId}"]`),
  ).toBeTruthy();
});
it("keeps saved notes readable on Free and offers Pro instead of a dead form", async () => {
  tools = "DENIED";
  await open();
  expect(document.body.textContent).toContain("Buyer wants a swap");
  expect(field()).toBeNull();
  expect(document.querySelector('a[href="/plans"]')).toBeTruthy();
});
