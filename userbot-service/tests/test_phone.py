import pytest

from userbot_service.errors import ApiError
from userbot_service.phone import mask_phone, normalize_phone


@pytest.mark.parametrize("raw", ["+998 90 123 45 67", "998901234567", " +998-90-123-45-67 "])
def test_formatting_is_stripped_and_a_plus_is_added(raw):
    assert normalize_phone(raw) == "+998901234567"


@pytest.mark.parametrize("raw", ["", "+", "abc", "+12", "+1234567890123456"])
def test_an_impossible_number_is_refused_before_telegram_sees_it(raw):
    with pytest.raises(ApiError) as e:
        normalize_phone(raw)
    assert e.value.code == "PHONE_INVALID"


def test_only_the_country_code_and_the_last_two_digits_stay_visible():
    assert mask_phone("998901234567") == "+998 ******* 67"


def test_a_short_number_is_masked_entirely():
    assert mask_phone("1234") == "+****"
