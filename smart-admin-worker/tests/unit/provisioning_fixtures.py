"""Authorized fixture gate; external authority is tested separately via HTTP fixtures."""

from uuid import uuid4

from smart_admin_worker.trade.client import ProvisionClaim


class AuthorizingClaims:
    async def claim(self, mailbox_id, trade_id, email, password):
        return ProvisionClaim(uuid4(), mailbox_id, email, True, password)


async def credentials_valid(email, password):
    return True
