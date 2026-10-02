"""Pure: one Telegram message → at most one observation. The parsers are the
correctness boundary (see README); this only picks the topic and payload."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from userbot_service.kafka_client import (
    CARD_CREDIT_OBSERVED,
    CARD_DEBIT_OBSERVED,
    build_card_credit_payload,
    build_card_debit_payload,
)
from userbot_service.parser import parse_debit, parse_topup
from userbot_service.telegram.ports import Msg


def observation_for(msg: Msg, userbot_telegram_id: int) -> tuple[str, dict[str, Any]] | None:
    observed_at = msg.date or datetime.now(UTC)
    topup = parse_topup(msg.text)
    if topup is not None:
        return CARD_CREDIT_OBSERVED, build_card_credit_payload(
            telegram_message_id=msg.id, card_last4=topup.card_last4,
            amount_tiyin=topup.amount_tiyin, card_balance_tiyin=topup.card_balance_tiyin,
            observed_at=observed_at, raw_text=msg.text, userbot_telegram_id=userbot_telegram_id)
    debit = parse_debit(msg.text)
    if debit is not None:
        return CARD_DEBIT_OBSERVED, build_card_debit_payload(
            telegram_message_id=msg.id, card_last4=debit.card_last4,
            amount_tiyin=debit.amount_tiyin, commission_tiyin=debit.commission_tiyin,
            card_balance_tiyin=debit.card_balance_tiyin, description=debit.description,
            observed_at=observed_at, raw_text=msg.text, userbot_telegram_id=userbot_telegram_id)
    return None
