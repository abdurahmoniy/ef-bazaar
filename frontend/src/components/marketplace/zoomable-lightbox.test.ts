import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ZoomableLightbox } from "./zoomable-lightbox";

describe("ZoomableLightbox", () => {
  it("renders fullscreen lightbox with zoom controls and close button", () => {
    const onClose = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(ZoomableLightbox, {
        src: "https://efbazaar.uz/bot/photo/test-1",
        alt: "Akkount rasmi",
        onClose,
      }),
    );

    expect(markup).toContain('data-testid="zoomable-lightbox"');
    expect(markup).toContain('src="https://efbazaar.uz/bot/photo/test-1"');
    expect(markup).toContain('alt="Akkount rasmi"');
    expect(markup).toContain('aria-label="Yopish"');
    expect(markup).toContain('aria-label="Kattalashtirish"');
    expect(markup).toContain('aria-label="Kichiklashtirish"');
    expect(markup).toContain("100%");
  });

  it("renders counter and navigation arrows when multiple images exist", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(ZoomableLightbox, {
        src: "https://efbazaar.uz/bot/photo/test-2",
        alt: "Akkount rasmi 2",
        onClose: vi.fn(),
        onPrev,
        onNext,
        hasPrev: true,
        hasNext: true,
        currentIndex: 1,
        totalCount: 4,
      }),
    );

    expect(markup).toContain("2 / 4");
    expect(markup).toContain('aria-label="Oldingi rasm"');
    expect(markup).toContain('aria-label="Keyingi rasm"');
  });
});
