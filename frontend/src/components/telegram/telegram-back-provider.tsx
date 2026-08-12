'use client';

import * as React from 'react';

import { getTelegramWebApp } from '@/lib/telegram';
import type { TelegramWebApp, TelegramWebAppBackButton } from '@/lib/types';

export type TelegramBackLayer = {
  id: string;
  kind: 'overlay' | 'route';
  onBack: () => void;
  lockVerticalSwipes: boolean;
};

type TelegramBackContextValue = {
  isMiniApp: boolean;
  register(layer: TelegramBackLayer): () => void;
};

type NativeBackBridge = {
  webApp: TelegramWebApp;
  backButton: TelegramWebAppBackButton;
  handleBack: () => void;
  listenerAttempted: boolean;
  released: boolean;
};

const TelegramBackContext = React.createContext<TelegramBackContextValue>({
  isMiniApp: false,
  register: () => () => undefined,
});

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function safely(operation: () => void): boolean {
  try {
    operation();
    return true;
  } catch {
    return false;
  }
}

function hasTelegramLaunchEvidence(webApp: TelegramWebApp | undefined): webApp is TelegramWebApp {
  return typeof webApp?.initData === 'string' && webApp.initData.trim().length > 0;
}

/**
 * The sole owner of Telegram's native BackButton listener.
 *
 * Layers retain registration order. Native back always closes the most
 * recently registered overlay before it considers the most recent route.
 * Internal symbols keep callers with duplicate public IDs independent.
 */
export function TelegramBackProvider({ children }: { children: React.ReactNode }) {
  const layersRef = React.useRef(new Map<symbol, TelegramBackLayer>());
  const bridgeRef = React.useRef<NativeBackBridge | null>(null);
  const swipesLockedRef = React.useRef(false);
  const swipeRestoreNeededRef = React.useRef(false);
  const [revision, setRevision] = React.useState(0);
  const [isMiniApp, setMiniApp] = React.useState(false);

  const register = React.useCallback((layer: TelegramBackLayer) => {
    const token = Symbol(layer.id);
    layersRef.current.set(token, layer);
    setRevision((value) => value + 1);
    return () => {
      if (layersRef.current.delete(token)) {
        setRevision((value) => value + 1);
      }
    };
  }, []);

  const releaseBridge = React.useCallback((bridge: NativeBackBridge, showBrowserFallback: boolean) => {
    if (bridge.released) return;
    bridge.released = true;
    if (bridgeRef.current === bridge) bridgeRef.current = null;

    // Each SDK bridge operation is isolated: one broken method must not stop
    // the remaining cleanup calls on partial or older Telegram bridges.
    if (bridge.listenerAttempted) {
      safely(() => bridge.backButton.offClick(bridge.handleBack));
    }
    safely(() => bridge.backButton.hide());
    if (swipeRestoreNeededRef.current) {
      safely(() => bridge.webApp.enableVerticalSwipes?.());
    }
    swipesLockedRef.current = false;
    swipeRestoreNeededRef.current = false;

    if (showBrowserFallback) setMiniApp(false);
  }, []);

  // Layout timing is intentional. TelegramViewportBootstrap calls ready() in
  // a passive effect, so native ownership is resolved before Telegram reveals
  // the first interactive frame.
  useIsomorphicLayoutEffect(() => {
    const webApp = getTelegramWebApp();
    const backButton = webApp?.BackButton;
    if (!hasTelegramLaunchEvidence(webApp) || !backButton) return;

    const handleBack = () => {
      const layers = Array.from(layersRef.current.values());
      const overlays = layers.filter((layer) => layer.kind === 'overlay');
      const routes = layers.filter((layer) => layer.kind === 'route');
      const target = overlays.at(-1) ?? routes.at(-1);
      target?.onBack();
    };
    const bridge: NativeBackBridge = {
      webApp,
      backButton,
      handleBack,
      listenerAttempted: true,
      released: false,
    };

    if (!safely(() => backButton.onClick(handleBack))) {
      releaseBridge(bridge, false);
      return;
    }

    bridgeRef.current = bridge;
    setMiniApp(true);
    return () => releaseBridge(bridge, false);
  }, [releaseBridge]);

  useIsomorphicLayoutEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || bridge.released) return;

    const layers = Array.from(layersRef.current.values());
    if (layers.length) {
      if (!safely(() => bridge.backButton.show())) {
        releaseBridge(bridge, true);
        return;
      }
    } else {
      safely(() => bridge.backButton.hide());
    }

    const lockVerticalSwipes = layers.some(
      (layer) => layer.kind === 'overlay' && layer.lockVerticalSwipes,
    );
    if (lockVerticalSwipes && !swipesLockedRef.current) {
      swipeRestoreNeededRef.current = true;
      if (safely(() => bridge.webApp.disableVerticalSwipes?.())) {
        swipesLockedRef.current = true;
      }
    } else if (!lockVerticalSwipes && swipeRestoreNeededRef.current) {
      if (safely(() => bridge.webApp.enableVerticalSwipes?.())) {
        swipesLockedRef.current = false;
        swipeRestoreNeededRef.current = false;
      }
    }
  }, [releaseBridge, revision]);

  const value = React.useMemo(
    () => ({ isMiniApp, register }),
    [isMiniApp, register],
  );

  return (
    <TelegramBackContext.Provider value={value}>
      {children}
    </TelegramBackContext.Provider>
  );
}

export function useTelegramBackLayer(layer: TelegramBackLayer, active = true) {
  const { isMiniApp, register } = React.useContext(TelegramBackContext);
  const { id, kind, lockVerticalSwipes, onBack } = layer;
  const callbackRef = React.useRef(onBack);
  callbackRef.current = onBack;

  useIsomorphicLayoutEffect(() => {
    if (!active) return;
    return register({
      id,
      kind,
      lockVerticalSwipes,
      onBack: () => callbackRef.current(),
    });
  }, [active, id, kind, lockVerticalSwipes, register]);

  return isMiniApp;
}
