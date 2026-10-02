import uuid

import pytest

from tests.fakes import FakeLoginGateway
from userbot_service.errors import ApiError
from userbot_service.login import LoginService
from userbot_service.telegram.ports import TelegramError

ADMIN = uuid.uuid4()


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def service(repo, gateway, clock=None, **kw):
    return LoginService(gateway_factory=lambda: gateway, repo=repo, clock=clock or Clock(), **kw)


async def test_phone_then_code_connects_the_account(repo):
    gw = FakeLoginGateway()
    svc = service(repo, gw)

    step = await svc.start("+998 90 123 45 67", ADMIN)
    assert (step.status, step.code_type, step.timeout_sec) == ("CODE_SENT", "APP", 60)

    done = await svc.submit_code(step.login_id, "12345")
    assert done.status == "DONE"
    assert done.account.telegram_user_id == 5550001
    assert done.account.connected_by == ADMIN
    assert await repo.session_string(done.account.id) == "EXPORTED-SESSION"
    assert gw.connected is False


async def test_two_step_verification_asks_for_the_password_with_its_hint(repo):
    svc = service(repo, FakeLoginGateway(password="pw"))
    step = await svc.start("+998901234567", ADMIN)

    need = await svc.submit_code(step.login_id, "12345")
    assert (need.status, need.hint) == ("PASSWORD_REQUIRED", "it's the cat")

    done = await svc.submit_password(step.login_id, "pw")
    assert done.status == "DONE"


async def test_a_wrong_code_is_reported_and_can_be_retried(repo):
    svc = service(repo, FakeLoginGateway())
    step = await svc.start("+998901234567", ADMIN)
    with pytest.raises(ApiError) as e:
        await svc.submit_code(step.login_id, "00000")
    assert e.value.code == "CODE_INVALID"
    assert (await svc.submit_code(step.login_id, "12345")).status == "DONE"


async def test_five_wrong_codes_end_the_login(repo):
    gw = FakeLoginGateway()
    svc = service(repo, gw)
    step = await svc.start("+998901234567", ADMIN)
    for _ in range(5):
        with pytest.raises(ApiError):
            await svc.submit_code(step.login_id, "00000")
    with pytest.raises(ApiError) as e:
        await svc.submit_code(step.login_id, "12345")
    assert e.value.code == "LOGIN_GONE"
    assert gw.connected is False


async def test_five_wrong_passwords_end_the_login(repo):
    svc = service(repo, FakeLoginGateway(password="pw"))
    step = await svc.start("+998901234567", ADMIN)
    await svc.submit_code(step.login_id, "12345")
    for _ in range(5):
        with pytest.raises(ApiError):
            await svc.submit_password(step.login_id, "nope")
    with pytest.raises(ApiError) as e:
        await svc.submit_password(step.login_id, "pw")
    assert e.value.code == "LOGIN_GONE"


async def test_a_password_before_the_code_is_refused(repo):
    svc = service(repo, FakeLoginGateway(password="pw"))
    step = await svc.start("+998901234567", ADMIN)
    with pytest.raises(ApiError) as e:
        await svc.submit_password(step.login_id, "pw")
    assert e.value.code == "LOGIN_GONE"


async def test_an_expired_login_is_gone_and_its_client_closed(repo):
    clock = Clock()
    gw = FakeLoginGateway()
    svc = service(repo, gw, clock=clock)
    step = await svc.start("+998901234567", ADMIN)
    clock.t = 301
    await svc.sweep()
    assert gw.connected is False
    with pytest.raises(ApiError) as e:
        await svc.submit_code(step.login_id, "12345")
    assert e.value.code == "LOGIN_GONE"


async def test_flood_wait_is_passed_through_with_its_wait(repo):
    svc = service(repo, FakeLoginGateway(send_error=TelegramError("FLOOD_WAIT", retry_after=42)))
    with pytest.raises(ApiError) as e:
        await svc.start("+998901234567", ADMIN)
    assert e.value.code == "FLOOD_WAIT"
    assert e.value.params == {"retryAfterSec": 42}


async def test_already_connected_logs_the_new_session_out(repo):
    first = service(repo, FakeLoginGateway())
    s1 = await first.start("+998901234567", ADMIN)
    await first.submit_code(s1.login_id, "12345")

    gw = FakeLoginGateway()
    second = service(repo, gw)
    s2 = await second.start("+998901234567", ADMIN)
    with pytest.raises(ApiError) as e:
        await second.submit_code(s2.login_id, "12345")
    assert e.value.code == "ALREADY_CONNECTED"
    assert gw.logged_out is True


async def test_too_many_parallel_logins_are_refused(repo):
    svc = LoginService(gateway_factory=FakeLoginGateway, repo=repo, clock=Clock(), max_pending=2)
    await svc.start("+998901234567", ADMIN)
    await svc.start("+998901234568", ADMIN)
    with pytest.raises(ApiError) as e:
        await svc.start("+998901234569", ADMIN)
    assert e.value.code == "TOO_MANY_LOGINS"


async def test_resend_returns_the_new_delivery(repo):
    svc = service(repo, FakeLoginGateway())
    step = await svc.start("+998901234567", ADMIN)
    again = await svc.resend(step.login_id)
    assert (again.status, again.code_type) == ("CODE_SENT", "SMS")


async def test_cancel_closes_the_client(repo):
    gw = FakeLoginGateway()
    svc = service(repo, gw)
    step = await svc.start("+998901234567", ADMIN)
    await svc.cancel(step.login_id)
    assert gw.connected is False
