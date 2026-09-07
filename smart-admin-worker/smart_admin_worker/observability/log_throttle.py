"""Decides which log records are worth a Telegram message.

Same behaviour as the Java `LogThrottle` in trade/payment/auth/marketplace,
and the same reason. On 2026-09-07 trade-service wrote 669,000 lines a
minute; forwarded verbatim that is 11,000 Kafka records and 11,000 Telegram
messages a second, against a 420 MB broker and a group that accepts about 30.
The flood would have taken out the channel reporting it.

Two independent limits, because they catch different shapes of trouble:

* **Dedup** — the same error repeating is one piece of information, not a
  thousand. Keyed by caller, so a loop reports once a window.
* **Ceiling** — many *different* errors at once is a flood dedup cannot see.

What is dropped is counted and reported once, on the next window. Silent
suppression turns a flood into a silence, which reads exactly like everything
being fine.

Thread-safe: log records arrive from the event loop and from worker threads
(``asyncio.to_thread`` IMAP polls) alike.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Verdict:
    """Whether to publish, and what was dropped since the last report."""

    send: bool
    suppressed: int


class LogThrottle:
    def __init__(
        self,
        max_per_window: int = 20,
        window_seconds: float = 60.0,
        dedup_seconds: float = 60.0,
        max_tracked_keys: int = 500,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_per_window = max_per_window
        self._window_seconds = window_seconds
        self._dedup_seconds = dedup_seconds
        self._max_tracked_keys = max_tracked_keys
        self._clock = clock

        self._lock = threading.Lock()
        self._last_seen: dict[str, float] = {}
        self._window_start = clock()
        self._sent_in_window = 0
        self._suppressed_in_window = 0
        # Carries the previous window's drop count until someone reports it.
        self._pending_report = 0

    def admit(self, key: str) -> Verdict:
        with self._lock:
            now = self._clock()
            self._roll_window_if_due(now)

            previous = self._last_seen.get(key)
            if previous is not None and now - previous < self._dedup_seconds:
                self._suppressed_in_window += 1
                return Verdict(False, 0)

            if self._sent_in_window >= self._max_per_window:
                self._suppressed_in_window += 1
                return Verdict(False, 0)

            self._evict_if_crowded(now)
            self._last_seen[key] = now
            self._sent_in_window += 1

            report, self._pending_report = self._pending_report, 0
            return Verdict(True, report)

    def tracked_keys(self) -> int:
        with self._lock:
            return len(self._last_seen)

    def _roll_window_if_due(self, now: float) -> None:
        if now - self._window_start < self._window_seconds:
            return
        self._window_start = now
        self._sent_in_window = 0
        if self._suppressed_in_window:
            self._pending_report += self._suppressed_in_window
            self._suppressed_in_window = 0

    def _evict_if_crowded(self, now: float) -> None:
        """Keeps the dedup table bounded.

        A key built from anything per-request — a trade id in a message —
        would add a row per error for ever, making the guard a leak of its
        own. Entries past their dedup window go first; if that frees nothing
        the table is cleared outright rather than allowed to grow. Losing
        dedup state costs at most one extra message per key, which is the
        cheaper failure.
        """
        if len(self._last_seen) < self._max_tracked_keys:
            return
        cutoff = now - self._dedup_seconds
        self._last_seen = {k: v for k, v in self._last_seen.items() if v >= cutoff}
        if len(self._last_seen) >= self._max_tracked_keys:
            self._last_seen.clear()
