'use client';

import * as React from 'react';

import { getTelegramWebApp } from '@/lib/telegram';

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

const TelegramBackContext = React.createContext<TelegramBackContextValue>({
  isMiniApp: false,
  register: () => () => undefined,
});

/**
 * The sole owner of Telegram's native BackButton listener.
 *
 * Layers retain registration order. Native back always closes the most
 * recently registered overlay before it considers the most recent route.
 * Vertical swipes remain disabled while at least one active overlay requests
 * a lock, and are restored only after the final lock is released.
 */
export function TelegramBackProvider({ children }: { children: React.ReactNode }) {
  const layersRef = React.useRef(new Map<string, TelegramBackLayer>());
  const swipesLockedRef = React.useRef(false);
  const [revision, setRevision] = React.useState(0);
  const [isMiniApp, setMiniApp] = React.useState(false);

  const register = React.useCallback((layer: TelegramBackLayer) => {
    layersRef.current.set(layer.id, layer);
    setRevision((value) => value + 1);
    return () => {
      if (layersRef.current.delete(layer.id)) {
        setRevision((value) => value + 1);
      }
    };
  }, []);

  React.useEffect(() => {
    const webApp = getTelegramWebApp();
    const backButton = webApp?.BackButton;
    if (!webApp || !backButton) return;

    setMiniApp(true);
    const handleBack = () => {
      const layers = Array.from(layersRef.current.values());
      const overlays = layers.filter((layer) => layer.kind === 'overlay');
      const routes = layers.filter((layer) => layer.kind === 'route');
      const target = overlays.at(-1) ?? routes.at(-1);
      target?.onBack();
    };

    backButton.onClick(handleBack);
    return () => {
      backButton.offClick(handleBack);
      backButton.hide();
      if (swipesLockedRef.current) {
        webApp.enableVerticalSwipes?.();
        swipesLockedRef.current = false;
      }
    };
  }, []);

  React.useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp?.BackButton) return;

    const layers = Array.from(layersRef.current.values());
    if (layers.length) webApp.BackButton.show();
    else webApp.BackButton.hide();

    const lockVerticalSwipes = layers.some(
      (layer) => layer.kind === 'overlay' && layer.lockVerticalSwipes,
    );
    if (lockVerticalSwipes && !swipesLockedRef.current) {
      webApp.disableVerticalSwipes?.();
      swipesLockedRef.current = true;
    } else if (!lockVerticalSwipes && swipesLockedRef.current) {
      webApp.enableVerticalSwipes?.();
      swipesLockedRef.current = false;
    }
  }, [revision]);

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

  React.useEffect(() => {
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
