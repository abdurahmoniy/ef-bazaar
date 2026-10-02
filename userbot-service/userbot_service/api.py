"""Admin panel API. nginx authenticates and forwards X-User-Id / X-User-Roles;
this service only checks the role, like every service behind auth_request."""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from userbot_service.errors import ApiError
from userbot_service.features import FEATURES
from userbot_service.login import LoginService, LoginStep
from userbot_service.repository import Account, AccountRepository

ALIVE_WITHIN_SECONDS = 30


class PhoneIn(BaseModel):
    phone: str


class CodeIn(BaseModel):
    code: str


class PasswordIn(BaseModel):
    password: str


class BindIn(BaseModel):
    accountId: UUID  # noqa: N815 — wire name


def require_admin(x_user_roles: str | None = Header(None),
                  x_user_id: str | None = Header(None)) -> UUID | None:
    roles = {r.strip() for r in (x_user_roles or "").split(",")}
    if "ROLE_ADMIN" not in roles:
        raise ApiError("FORBIDDEN")
    try:
        return UUID(x_user_id) if x_user_id else None
    except ValueError:
        return None


Admin = Annotated[UUID | None, Depends(require_admin)]


def create_app(
    *, repo: AccountRepository, logins: LoginService,
    logout: Callable[[UUID], Awaitable[None]],
    liveness: Callable[[], Awaitable[dict[UUID, tuple[str, datetime]]]],
    avatar_dir: str,
) -> FastAPI:
    app = FastAPI(title="userbot-service", docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(ApiError)
    async def _api_error(_req: Request, e: ApiError) -> JSONResponse:
        body = {"code": e.code, "message": e.message, **e.params}
        return JSONResponse(body, status_code=e.status)

    def avatar_path(account_id: UUID) -> str:
        return os.path.join(avatar_dir, f"{account_id}.jpg")

    async def account_json(a: Account, live=None, features=None) -> dict:
        live = live if live is not None else await liveness()
        runner, beat = live.get(a.id, (None, None))
        age = (datetime.now(UTC) - beat).total_seconds() if beat is not None else None
        alive = age is not None and age <= ALIVE_WITHIN_SECONDS
        return {
            "id": str(a.id), "firstName": a.first_name, "lastName": a.last_name,
            "username": a.username, "phoneMasked": a.phone_masked, "status": a.status,
            "statusReason": a.status_reason, "source": a.source,
            "connectedBy": str(a.connected_by) if a.connected_by else None,
            "connectedAt": a.connected_at.isoformat(),
            "alive": bool(alive and a.status == "ACTIVE"),
            "lastHeartbeat": beat.isoformat() if beat and beat.year > 1970 else None,
            "runner": runner,
            "features": features if features is not None else await repo.features_of(a.id),
            "hasAvatar": os.path.exists(avatar_path(a.id)),
        }

    async def step_json(step: LoginStep) -> dict:
        body: dict = {"loginId": str(step.login_id), "status": step.status}
        if step.code_type is not None:
            body["codeType"] = step.code_type
        if step.timeout_sec is not None:
            body["timeoutSec"] = step.timeout_sec
        if step.status == "PASSWORD_REQUIRED":
            body["hint"] = step.hint
        if step.account is not None:
            body["account"] = await account_json(step.account)
        return body

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    @app.post("/api/v1/logins")
    async def start_login(body: PhoneIn, actor: Admin) -> dict:
        return await step_json(await logins.start(body.phone, actor))

    @app.post("/api/v1/logins/{login_id}/code")
    async def submit_code(login_id: UUID, body: CodeIn, _: Admin) -> dict:
        return await step_json(await logins.submit_code(login_id, body.code))

    @app.post("/api/v1/logins/{login_id}/password")
    async def submit_password(login_id: UUID, body: PasswordIn, _: Admin) -> dict:
        return await step_json(await logins.submit_password(login_id, body.password))

    @app.post("/api/v1/logins/{login_id}/resend")
    async def resend(login_id: UUID, _: Admin) -> dict:
        return await step_json(await logins.resend(login_id))

    @app.delete("/api/v1/logins/{login_id}", status_code=204)
    async def cancel(login_id: UUID, _: Admin) -> Response:
        await logins.cancel(login_id)
        return Response(status_code=204)

    @app.get("/api/v1/accounts")
    async def list_accounts(_: Admin) -> list[dict]:
        live = await liveness()
        by_account: dict[UUID, list[str]] = {}
        for feature, account_id in sorted((await repo.bindings()).items()):
            by_account.setdefault(account_id, []).append(feature)
        return [await account_json(a, live, by_account.get(a.id, [])) for a in await repo.list()]

    @app.get("/api/v1/accounts/{account_id}/avatar")
    async def avatar(account_id: UUID, _: Admin):
        path = avatar_path(account_id)
        if not os.path.exists(path):
            return Response(status_code=404)
        return FileResponse(path, media_type="image/jpeg")

    @app.delete("/api/v1/accounts/{account_id}", status_code=204)
    async def disconnect(account_id: UUID, _: Admin) -> Response:
        await repo.get(account_id)
        features = await repo.features_of(account_id)
        if features:
            raise ApiError("ACCOUNT_BOUND", features=", ".join(features))
        await logout(account_id)
        return Response(status_code=204)

    @app.get("/api/v1/features")
    async def list_features(_: Admin) -> list[dict]:
        bound = await repo.bindings()
        return [{"feature": f, "title": t, "accountId": str(bound[f]) if f in bound else None}
                for f, t in FEATURES.items()]

    @app.put("/api/v1/features/{feature}")
    async def bind(feature: str, body: BindIn, actor: Admin) -> dict:
        await repo.bind(feature, body.accountId, actor)
        return {"feature": feature, "title": FEATURES[feature], "accountId": str(body.accountId)}

    return app
