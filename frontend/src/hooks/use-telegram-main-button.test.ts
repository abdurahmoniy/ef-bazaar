// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTelegramMainButton } from './use-telegram-main-button';
import { getTelegramWebApp } from '@/lib/telegram';

vi.mock('@/lib/telegram', () => ({
  getTelegramWebApp: vi.fn(),
}));

describe('useTelegramMainButton', () => {
  let root: Root;
  let container: HTMLDivElement;
  let mainButtonMock: {
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    onClick: ReturnType<typeof vi.fn>;
    offClick: ReturnType<typeof vi.fn>;
    setText: ReturnType<typeof vi.fn>;
    enable: ReturnType<typeof vi.fn>;
    disable: ReturnType<typeof vi.fn>;
    showProgress: ReturnType<typeof vi.fn>;
    hideProgress: ReturnType<typeof vi.fn>;
  };
  let hapticMock: {
    impactOccurred: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mainButtonMock = {
      show: vi.fn(),
      hide: vi.fn(),
      onClick: vi.fn(),
      offClick: vi.fn(),
      setText: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      showProgress: vi.fn(),
      hideProgress: vi.fn(),
    };
    hapticMock = {
      impactOccurred: vi.fn(),
    };
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function Probe(props: Parameters<typeof useTelegramMainButton>[0] & { onStatus?: (active: boolean) => void }) {
    const active = useTelegramMainButton(props);
    props.onStatus?.(active);
    return createElement('div', { 'data-active': String(active) });
  }

  it('returns false outside Telegram WebApp', async () => {
    vi.mocked(getTelegramWebApp).mockReturnValue(undefined);

    let status = true;
    await act(async () => {
      root.render(createElement(Probe, { text: 'Test', onClick: vi.fn(), onStatus: a => { status = a; } }));
    });

    expect(status).toBe(false);
    expect(container.querySelector('[data-active]')?.getAttribute('data-active')).toBe('false');
  });

  it('returns false when enabled is false even if MainButton exists', async () => {
    vi.mocked(getTelegramWebApp).mockReturnValue({
      MainButton: mainButtonMock as any,
    } as any);

    let status = true;
    await act(async () => {
      root.render(createElement(Probe, { text: 'Test', onClick: vi.fn(), enabled: false, onStatus: a => { status = a; } }));
    });

    expect(status).toBe(false);
    expect(mainButtonMock.show).not.toHaveBeenCalled();
  });

  it('returns true and shows MainButton inside Telegram WebApp', async () => {
    vi.mocked(getTelegramWebApp).mockReturnValue({
      MainButton: mainButtonMock as any,
      HapticFeedback: hapticMock as any,
    } as any);

    const onClick = vi.fn();
    let status = false;
    await act(async () => {
      root.render(createElement(Probe, { text: 'Tasdiqlash', onClick, onStatus: a => { status = a; } }));
    });

    expect(status).toBe(true);
    expect(mainButtonMock.show).toHaveBeenCalledOnce();
    expect(mainButtonMock.onClick).toHaveBeenCalledOnce();
    expect(mainButtonMock.setText).toHaveBeenCalledWith('Tasdiqlash');
    expect(mainButtonMock.enable).toHaveBeenCalled();

    // Trigger click
    const clickHandler = mainButtonMock.onClick.mock.calls[0][0];
    act(() => {
      clickHandler();
    });

    expect(hapticMock.impactOccurred).toHaveBeenCalledWith('medium');
    expect(onClick).toHaveBeenCalledOnce();

    // Unmount
    await act(async () => {
      root.render(null);
    });
    expect(mainButtonMock.offClick).toHaveBeenCalledWith(clickHandler);
    expect(mainButtonMock.hide).toHaveBeenCalledOnce();
  });

  it('synchronizes text, disabled, and loading states', async () => {
    vi.mocked(getTelegramWebApp).mockReturnValue({
      MainButton: mainButtonMock as any,
    } as any);

    await act(async () => {
      root.render(createElement(Probe, { text: 'Boshlash', onClick: vi.fn(), disabled: false, loading: false }));
    });

    expect(mainButtonMock.setText).toHaveBeenLastCalledWith('Boshlash');
    expect(mainButtonMock.enable).toHaveBeenCalled();
    expect(mainButtonMock.hideProgress).toHaveBeenCalled();

    // Update to disabled and loading
    await act(async () => {
      root.render(createElement(Probe, { text: 'Yuklanmoqda…', onClick: vi.fn(), disabled: true, loading: true }));
    });

    expect(mainButtonMock.setText).toHaveBeenLastCalledWith('Yuklanmoqda…');
    expect(mainButtonMock.disable).toHaveBeenCalled();
    expect(mainButtonMock.showProgress).toHaveBeenCalledWith(false);
  });
});
