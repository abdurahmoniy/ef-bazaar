'use client';

import { useEffect, useState } from 'react';

import { formatDurationUz, secondsUntil } from '@/lib/trade-human';

export function CountdownText({
  until,
  prefix,
  expiredLabel = 'Muddati tugagan',
}: {
  until: string | null | undefined;
  prefix?: string;
  expiredLabel?: string;
}) {
  const [seconds, setSeconds] = useState(() => secondsUntil(until));

  useEffect(() => {
    setSeconds(secondsUntil(until));
    const id = window.setInterval(() => setSeconds(secondsUntil(until)), 30_000);
    return () => window.clearInterval(id);
  }, [until]);

  if (seconds === null) return null;
  if (seconds <= 0) return <span>{expiredLabel}</span>;

  return (
    <span>
      {prefix ? `${prefix} ` : ''}
      {formatDurationUz(seconds)}
    </span>
  );
}
