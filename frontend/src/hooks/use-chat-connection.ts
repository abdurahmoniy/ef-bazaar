'use client';
import { useEffect, useState } from 'react';
import { getChatSocket } from '@/lib/chat-socket';

export function useChatConnection(viewerId: string) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const socket = getChatSocket(viewerId);
    setConnected(socket.connected);
    return socket.subscribe(event => {
      if (event.type === 'connected') setConnected(true);
      if (event.type === 'disconnected') setConnected(false);
    });
  }, [viewerId]);
  return connected;
}
