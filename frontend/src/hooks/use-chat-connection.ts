'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getChatSocket } from '@/lib/chat-socket';

function subscribeNetwork(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
const networkSnapshot = () => navigator.onLine;
const serverNetworkSnapshot = () => true;

export function useChatConnection(viewerId: string) {
  const networkOnline = useSyncExternalStore(subscribeNetwork, networkSnapshot, serverNetworkSnapshot);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const socket = getChatSocket(viewerId);
    setConnected(socket.connected);
    return socket.subscribe(event => {
      if (event.type === 'connected') setConnected(true);
      if (event.type === 'disconnected') setConnected(false);
    });
  }, [viewerId]);
  return { connected, networkOnline };
}
