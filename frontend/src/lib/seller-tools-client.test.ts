import { afterEach, expect, it, vi } from "vitest";
import {
  appendTemplate,
  toolsCapabilities,
  toolsRequest,
  validBulkPrice,
} from "./seller-tools-client";
afterEach(() => {
  vi.unstubAllGlobals();
});
it("uses exact service grants and server bulk limit with conservative malformed fallback", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          tools: "AVAILABLE",
          bulk: "DENIED",
          profileDecoration: "UNAVAILABLE",
          bulkLimit: 3,
        }),
      ),
  );
  expect(await toolsCapabilities()).toEqual({
    tools: "AVAILABLE",
    bulk: "DENIED",
    profileDecoration: "UNAVAILABLE",
    bulkLimit: 3,
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          tools: true,
          bulk: "AVAILABLE",
          profileDecoration: "AVAILABLE",
          bulkLimit: 0,
        }),
      ),
  );
  expect(await toolsCapabilities()).toEqual({
    tools: "UNAVAILABLE",
    bulk: "UNAVAILABLE",
    profileDecoration: "UNAVAILABLE",
    bulkLimit: 0,
  });
});
it("authenticates JSON reads, writes and aborts without caching; surfaces typed permission failures", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ content: [] }));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  await toolsRequest("/seller-tools/notes?page=0&size=50", {
    signal: controller.signal,
  });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/marketplace/v1/seller-tools/notes?page=0&size=50",
    expect.objectContaining({
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: expect.objectContaining({ Accept: "application/json" }),
    }),
  );
  fetcher.mockResolvedValue(
    Response.json({ code: "upgrade_required" }, { status: 403 }),
  );
  await expect(toolsRequest("/seller-tools/templates")).rejects.toMatchObject({
    status: 403,
    code: "upgrade_required",
  });
  fetcher.mockResolvedValue(
    new Response("<html/>", { headers: { "Content-Type": "text/html" } }),
  );
  await expect(toolsRequest("/seller-tools/templates")).rejects.toThrow();
});
it("preserves exact decimal prices without floating conversion and enforces decimal bounds", () => {
  for (const value of [
    "5000",
    "5000.00",
    "9007199254740993.12",
    "99999999999999999.99",
  ])
    expect(validBulkPrice(value), value).toBe(true);
  for (const value of [
    "4999.99",
    "5000.001",
    "100000000000000000",
    "5e3",
    "NaN",
    "-5000",
    " 5000",
  ])
    expect(validBulkPrice(value), value).toBe(false);
});
it("appends templates without sending or discarding existing draft and rejects overlong combined drafts", () => {
  expect(appendTemplate("Existing", "Reply")).toBe("Existing\nReply");
  expect(appendTemplate("", "Reply")).toBe("Reply");
  expect(appendTemplate("x".repeat(3999), "ok")).toBeNull();
});
