"""Urinishlar tugaganda kutayotgan tomonga xabar beriladi.

Ilgari xabar shu yerda jimgina yo'qolardi: uch urinishdan keyin
offset commit bo'lar va hech kim natijani bilmasdi. Savdo INITIATED
holatida abadiy qotib qolardi — u holatda TIMEOUT ham, rad etish ham
yo'q — va xaridorning puli muzlab turardi.
"""

from __future__ import annotations

from dataclasses import dataclass

from smart_admin_worker.kafka.consumer import KafkaConsumerRunner


@dataclass(frozen=True)
class _Event:
    trade_id: str = "t-1"
    mailbox_id: str = "m-1"


class _Msg:
    def __init__(self) -> None:
        self.topic = "efbazaar.trade.email-provision-request"
        self.value = b"{}"


class _Consumer:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1


def _runner(handler, on_exhausted=None) -> KafkaConsumerRunner:
    runner = KafkaConsumerRunner(
        bootstrap_servers="x:9092",
        group_id="g",
        topics=["efbazaar.trade.email-provision-request"],
        handlers={"efbazaar.trade.email-provision-request": handler},
        on_exhausted=on_exhausted,
    )
    runner._consumer = _Consumer()  # noqa: SLF001 — sinov uchun
    return runner


async def test_exhausted_callback_fires_once_after_retries(monkeypatch):
    seen: list[tuple[str, object, Exception]] = []
    attempts = {"n": 0}

    async def always_fails(_event: object) -> None:
        attempts["n"] += 1
        raise TimeoutError("ConnectTimeout")

    async def on_exhausted(topic: str, event: object, exc: Exception) -> None:
        seen.append((topic, event, exc))

    runner = _runner(always_fails, on_exhausted)
    monkeypatch.setattr(
        "smart_admin_worker.kafka.consumer.from_json", lambda *_a, **_k: _Event()
    )

    await runner._process_one(_Msg())  # noqa: SLF001

    # Uch urinish, lekin BITTA xabar: har urinishda yuborsak savdo
    # uch marta yopilishga urinilardi.
    assert attempts["n"] == 3
    assert len(seen) == 1
    assert seen[0][0] == "efbazaar.trade.email-provision-request"


async def test_offset_is_committed_even_when_the_callback_throws(monkeypatch):
    # Xabar bera olmaslik butun navbatni to'xtatib qo'ymasligi kerak.
    async def always_fails(_event: object) -> None:
        raise TimeoutError("ConnectTimeout")

    async def broken(_t: str, _e: object, _x: Exception) -> None:
        raise RuntimeError("kafka down")

    runner = _runner(always_fails, broken)
    monkeypatch.setattr(
        "smart_admin_worker.kafka.consumer.from_json", lambda *_a, **_k: _Event()
    )

    await runner._process_one(_Msg())  # noqa: SLF001

    assert runner._consumer.commits == 1  # noqa: SLF001


async def test_a_successful_handler_never_reports_failure(monkeypatch):
    seen: list[object] = []

    async def works(_event: object) -> None:
        return None

    async def on_exhausted(_t: str, e: object, _x: Exception) -> None:
        seen.append(e)

    runner = _runner(works, on_exhausted)
    monkeypatch.setattr(
        "smart_admin_worker.kafka.consumer.from_json", lambda *_a, **_k: _Event()
    )

    await runner._process_one(_Msg())  # noqa: SLF001

    assert seen == []
