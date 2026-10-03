import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from tests.fakes import ME, FakeLoginGateway
from userbot_service.api import create_app
from userbot_service.login import LoginService

ADMIN = str(uuid.uuid4())
H = {"X-User-Id": ADMIN, "X-User-Roles": "ROLE_USER,ROLE_ADMIN"}


@pytest.fixture
def state():
    return {"logged_out": [], "live": {}}


@pytest.fixture
async def client(repo, state, tmp_path):
    async def logout(account_id):
        state["logged_out"].append(account_id)
        await repo.mark_disconnected(account_id, None)

    async def liveness():
        return state["live"]

    logins = LoginService(gateway_factory=lambda: FakeLoginGateway(password="pw"), repo=repo)
    app = create_app(repo=repo, logins=logins, logout=logout, liveness=liveness,
                     avatar_dir=str(tmp_path))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c


@pytest.mark.parametrize("roles", [None, "ROLE_USER", "ROLE_TRADE_ADMIN", "ROLE_ADMINISTRATOR"])
async def test_only_admins_get_in(client, roles):
    headers = {"X-User-Roles": roles} if roles else {}
    r = await client.get("/api/v1/accounts", headers=headers)
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"


async def test_roles_with_spaces_are_understood(client):
    r = await client.get("/api/v1/accounts", headers={"X-User-Roles": "ROLE_USER, ROLE_ADMIN"})
    assert r.status_code == 200


async def test_the_full_login_with_two_step_verification(client):
    r = await client.post("/api/v1/logins", json={"phone": "+998 90 123 45 67"}, headers=H)
    assert r.status_code == 200
    login = r.json()
    assert login["status"] == "CODE_SENT" and login["codeType"] == "APP"

    lid = login["loginId"]
    r = await client.post(f"/api/v1/logins/{lid}/code", json={"code": "12345"}, headers=H)
    assert r.json() == {"loginId": lid, "status": "PASSWORD_REQUIRED", "hint": "it's the cat"}

    r = await client.post(f"/api/v1/logins/{lid}/password", json={"password": "pw"}, headers=H)
    body = r.json()
    assert body["status"] == "DONE"
    assert body["account"]["phoneMasked"] == "+998 ******* 67"
    assert body["account"]["connectedBy"] == ADMIN
    assert "session" not in r.text.lower()


async def test_a_wrong_code_is_an_uzbek_400(client):
    login = (await client.post("/api/v1/logins", json={"phone": "+998901234567"}, headers=H)).json()
    r = await client.post(f"/api/v1/logins/{login['loginId']}/code", json={"code": "0"}, headers=H)
    assert r.status_code == 400
    assert r.json() == {"code": "CODE_INVALID", "message": "Kod noto'g'ri."}


async def test_an_unknown_login_is_gone(client):
    r = await client.post(f"/api/v1/logins/{uuid.uuid4()}/code", json={"code": "1"}, headers=H)
    assert r.status_code == 410


async def test_accounts_list_with_liveness_and_features(client, repo, state):
    a = await repo.upsert_connected(me=ME, session_string="S", source="IMPORTED", actor=None,
                                    bind_feature="PAYMENT")
    state["live"] = {a.id: ("payment", datetime.now(UTC) - timedelta(seconds=5))}

    [acc] = (await client.get("/api/v1/accounts", headers=H)).json()

    assert acc["features"] == ["PAYMENT"]
    assert acc["alive"] is True
    assert acc["runner"] == "payment"
    assert acc["source"] == "IMPORTED"
    assert acc["hasAvatar"] is False


async def test_a_stale_heartbeat_is_not_alive(client, repo, state):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    state["live"] = {a.id: ("core", datetime.now(UTC) - timedelta(seconds=31))}
    [acc] = (await client.get("/api/v1/accounts", headers=H)).json()
    assert acc["alive"] is False


async def test_a_never_renewed_lease_has_no_heartbeat(client, repo, state):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    state["live"] = {a.id: ("core", datetime(1970, 1, 1, tzinfo=UTC))}
    [acc] = (await client.get("/api/v1/accounts", headers=H)).json()
    assert acc["alive"] is False
    assert acc["lastHeartbeat"] is None


async def test_a_bound_account_cannot_be_disconnected(client, repo, state):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None,
                                    bind_feature="PAYMENT")
    r = await client.delete(f"/api/v1/accounts/{a.id}", headers=H)
    assert r.status_code == 409
    assert r.json()["code"] == "ACCOUNT_BOUND"
    assert "PAYMENT" in r.json()["message"]
    assert state["logged_out"] == []


async def test_an_unbound_account_is_logged_out(client, repo, state):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    r = await client.delete(f"/api/v1/accounts/{a.id}", headers=H)
    assert r.status_code == 204
    assert state["logged_out"] == [a.id]


async def test_features_list_and_binding(client, repo):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    assert (await client.get("/api/v1/features", headers=H)).json() == [
        {"feature": "PAYMENT", "title": "To'lovlarni kuzatish (Humo karta)", "accountId": None}]

    r = await client.put("/api/v1/features/PAYMENT", json={"accountId": str(a.id)}, headers=H)
    assert r.status_code == 200
    assert r.json()["accountId"] == str(a.id)


async def test_binding_an_unknown_feature_is_404(client, repo):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    r = await client.put("/api/v1/features/NOPE", json={"accountId": str(a.id)}, headers=H)
    assert r.status_code == 404


async def test_avatar_is_served_when_present(client, repo, tmp_path):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    assert (await client.get(f"/api/v1/accounts/{a.id}/avatar", headers=H)).status_code == 404
    (tmp_path / f"{a.id}.jpg").write_bytes(b"\xff\xd8jpeg")
    r = await client.get(f"/api/v1/accounts/{a.id}/avatar", headers=H)
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"


async def test_healthz_needs_no_auth(client):
    assert (await client.get("/healthz")).status_code == 200


async def test_a_number_for_the_password_is_not_echoed_back(client):
    url = f"/api/v1/logins/{uuid.uuid4()}/password"
    r = await client.post(url, json={"password": 12345}, headers=H)
    assert r.status_code == 422
    assert r.json() == {"code": "VALIDATION_ERROR", "message": "So'rov noto'g'ri.",
                        "fields": ["body.password"]}
    assert "12345" not in r.text


async def test_a_number_for_the_code_is_not_echoed_back(client):
    r = await client.post(f"/api/v1/logins/{uuid.uuid4()}/code", json={"code": 98765}, headers=H)
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_ERROR"
    assert "98765" not in r.text


async def test_an_unknown_path_uses_the_same_error_shape(client):
    r = await client.get("/api/v1/nope", headers=H)
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"
    r = await client.patch("/api/v1/accounts", headers=H)
    assert r.status_code == 405
    assert r.json()["code"] == "METHOD_NOT_ALLOWED"
