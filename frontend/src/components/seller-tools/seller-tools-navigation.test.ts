// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("@/app/auth/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/theme/use-theme", () => ({
  useTheme: () => ({ isDark: false, mounted: true, toggle: vi.fn() }),
}));
vi.mock("@/hooks/use-partner-status", () => ({
  usePartnerStatus: () => false,
}));
import { UserMenu } from "@/components/navigation/user-menu";
import type { User } from "@/lib/types";
it("opens a keyboard reachable seller tools menu link and closes the menu after activation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        createElement(UserMenu, {
          user: {
            id: "seller",
            displayName: "Seller",
            roles: [],
          } as unknown as User,
        }),
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Profil menyusi"]',
        )!
        .click(),
    );
    const link = host.querySelector<HTMLAnchorElement>(
      'a[href="/seller-tools"]',
    )!;
    expect(link?.textContent).toContain("Sotuvchi vositalari");
    expect(link.getAttribute("role")).toBe("menuitem");
    link.focus();
    expect(document.activeElement).toBe(link);
    expect(link.className).toContain("min-h-11");
    expect(host.querySelector('[role="menu"]')?.className).toContain(
      "overflow-y-auto",
    );
    link.addEventListener("click", (event) => event.preventDefault());
    await act(async () =>
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      ),
    );
    expect(host.querySelector('[role="menu"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
