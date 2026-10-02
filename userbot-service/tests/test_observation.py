from datetime import UTC, datetime

from tests.test_parser import TOPUP, WITHDRAWAL
from userbot_service.kafka_client import CARD_CREDIT_OBSERVED, CARD_DEBIT_OBSERVED
from userbot_service.payment.observation import observation_for
from userbot_service.telegram.ports import Msg

AT = datetime(2026, 10, 1, tzinfo=UTC)


def test_a_top_up_becomes_a_credit_observation_from_this_account():
    topic, payload = observation_for(Msg(7, TOPUP, AT), 5550001)
    assert topic == CARD_CREDIT_OBSERVED
    assert payload["telegramMessageId"] == 7
    assert payload["userbotTelegramId"] == 5550001


def test_a_debit_becomes_a_debit_observation():
    topic, _ = observation_for(Msg(8, WITHDRAWAL, AT), 5550001)
    assert topic == CARD_DEBIT_OBSERVED


def test_anything_else_is_nothing():
    assert observation_for(Msg(9, "salom", AT), 5550001) is None
    assert observation_for(Msg(10, None, AT), 5550001) is None
