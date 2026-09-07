"""Telegram kanalini u xabar beradigan servisdan himoya qiladi.

Java tarafdagi `LogThrottle` bilan bir xil xatti-harakat — o'sha sabab:
2026-09-07 da trade-service daqiqasiga 669 000 qator yozdi va har biri
Telegram xabariga aylanganida kanal aynan aytadigan gapi bor paytda
o'lardi.
"""

from __future__ import annotations

from humo_userbot.observability.log_throttle import LogThrottle

WINDOW = 60.0
CAP = 20


class FakeClock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _throttle(clock, cap=CAP, max_keys=500):
    return LogThrottle(max_per_window=cap, window_seconds=WINDOW,
                       dedup_seconds=WINDOW, max_tracked_keys=max_keys, clock=clock)


def test_the_same_error_repeating_is_sent_once():
    t = _throttle(FakeClock())

    assert t.admit("handler|ValueError").send is True
    assert t.admit("handler|ValueError").send is False
    assert t.admit("handler|ValueError").send is False


def test_a_repeat_is_sent_again_once_its_window_passes():
    clock = FakeClock()
    t = _throttle(clock)
    t.admit("handler|ValueError")

    clock.advance(WINDOW + 1)

    # Bir daqiqadan keyin ham buzuq ekani bilishga arziydi; abadiy sukunat yo'q.
    assert t.admit("handler|ValueError").send is True


def test_distinct_errors_pass_until_the_ceiling():
    t = _throttle(FakeClock())

    for i in range(CAP):
        assert t.admit(f"handler|Error{i}").send is True, i
    # Dedup buni o'tkazardi — to'xtatgan narsa chegara.
    assert t.admit("handler|Beyond").send is False


def test_what_was_dropped_is_reported_once():
    clock = FakeClock()
    t = _throttle(clock)
    for i in range(CAP + 5):
        t.admit(f"handler|Error{i}")

    clock.advance(WINDOW + 1)

    # Jimgina tashlash floodni sukunatga aylantiradi, sukunat esa
    # hammasi joyida degandek o'qiladi.
    assert t.admit("handler|Fresh").suppressed == 5
    assert t.admit("handler|Another").suppressed == 0


def test_the_ceiling_resets_with_the_window():
    clock = FakeClock()
    t = _throttle(clock)
    for i in range(CAP + 5):
        t.admit(f"handler|Error{i}")

    clock.advance(WINDOW + 1)

    assert t.admit("handler|AfterWindow").send is True


def test_the_dedup_table_cannot_grow_without_bound():
    # Kalitga UUID tushib qolsa jadval cheksiz o'sardi — himoyachining
    # o'zi xotira oqizardi.
    t = _throttle(FakeClock(), cap=10**9, max_keys=100)

    for i in range(1_000):
        t.admit(f"handler|unique-{i}")

    assert t.tracked_keys() <= 100
