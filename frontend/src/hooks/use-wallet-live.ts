'use client';

import { Client, type IMessage } from '@stomp/stompjs';
import { useEffect, useRef } from 'react';

/**
 * What payment-service pushes when a deposit lands.
 *
 * `amountTiyin` is what reached the wallet, not what was transferred: a bumped
 * invoice asks for a few tiyin more so the incoming bank notification can be
 * told apart from somebody else's.
 */
export interface WalletCreditedPush {
  type: 'DEPOSIT_CREDITED';
  invoiceId: string;
  amountTiyin: number;
  occurredAt: string;
}

/** `wss://` on a served page, `ws://` on a plain-HTTP dev host. */
export function walletSocketUrl(origin: string): string {
  const url = new URL('/ws/payment', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** The destination this user is allowed to subscribe to, and only this one. */
export function walletTopic(userId: string): string {
  return `/topic/wallet/${userId}`;
}

interface UseWalletLiveOptions {
  /** The signed-in user. The socket is same-origin, so the cookie authenticates it. */
  userId: string | null | undefined;
  /** Connect only while there is something to wait for. */
  enabled: boolean;
  onCredited: (push: WalletCreditedPush) => void;
}

/**
 * Keeps an open wallet page in step with money that arrives while it is open.
 *
 * <p>Before this, nothing on the page ever asked again: a deposit credited
 * seconds after the user left their banking app only showed up on a full
 * reload.
 *
 * <p>The callback is held in a ref rather than listed as an effect dependency.
 * An inline arrow at the call site changes identity on every render, and with
 * it in the dependency list the socket would be torn down and rebuilt each
 * time — reconnecting through the whole nginx auth handshake, and losing any
 * message that lands in the gap.
 */
export function useWalletLive({ userId, enabled, onCredited }: UseWalletLiveOptions): void {
  const handler = useRef(onCredited);
  handler.current = onCredited;

  useEffect(() => {
    if (!enabled || !userId || typeof window === 'undefined') return;

    const client = new Client({
      brokerURL: walletSocketUrl(window.location.origin),
      // The page is the source of truth for whether this should be running, so
      // the socket reconnects on its own while it is: a phone that slept
      // through the transfer comes back and re-subscribes.
      reconnectDelay: 5_000,
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      // The default logs every frame to the console, including on production
      // builds. There is nothing secret in a wallet push, but there is nothing
      // useful in it either.
      debug: () => {},
    });

    client.onConnect = () => {
      client.subscribe(walletTopic(userId), (message: IMessage) => {
        try {
          const push = JSON.parse(message.body) as WalletCreditedPush;
          if (push.type === 'DEPOSIT_CREDITED') handler.current(push);
        } catch {
          // A frame we cannot read is not worth breaking the page over: the
          // figures are still correct on the next load.
        }
      });
    };

    client.activate();
    // `deactivate` is async and closes the socket; the effect cannot await it,
    // and it does not need to — nothing later depends on it having finished.
    return () => {
      void client.deactivate();
    };
  }, [userId, enabled]);
}
