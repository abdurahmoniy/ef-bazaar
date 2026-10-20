"""Real DKIM signatures and local fixture DNS, without external mail or DNS."""

from __future__ import annotations

import asyncio
import base64
import threading
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime

import dkim
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from smart_admin_worker.imap.release_auth import ReleaseOriginVerifier

NOW = datetime(2026, 10, 20, 12, 0, 10, tzinfo=UTC)
START = NOW - timedelta(seconds=5)
END = NOW + timedelta(minutes=10)
MAILBOX = "retained@efbazaar.uz"
SIGNED_HEADERS = [b"from", b"to", b"subject", b"date", b"content-type", b"mime-version"]


# Deliberately weak, public test-only key: never usable as a production credential.
_RSA512_TEST_KEY = b"""-----BEGIN PRIVATE KEY-----
MIIBUwIBADANBgkqhkiG9w0BAQEFAASCAT0wggE5AgEAAkEAtLhEbl//57plX3TF
kwJ2WquNKveSdThPolkXY/e/nWQzRb2EY/ovDwWCPaEQbM7rR0kG/Ixd+Bn+FyDZ
nLHqcwIDAQABAkAE9qqqfWiB7NSr8oEasI6fnuaZr4MORSWqx9ekn0FcCUCsEtpf
OE/YvDKrsJrZBBvDgcQstnQE1Ad/zTQ6WajBAiEA3/IZqOSwJDbq92vx0aqjSrY/
wuip2E+o9QfBpEdD/mUCIQDOlkSBUWV7VdJgvL0bQb//DosElBR684cs7JHV0uKr
9wIgPZ3vUXkavdwealVZA8dfhn7+rDI4CTxh0ImBziGNo8ECIGH6Lp9OZVzrRQ2Q
Nff5ZP+ofBI90MDHQvLxd/D7RXndAiA+1C3rjwVG6VQ1JlqIqy9+wxPYZpWAy3oz
IY8ijDZJnw==
-----END PRIVATE KEY-----
"""


@pytest.fixture(scope="module")
def keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    public = key.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return private, b"v=DKIM1; k=rsa; p=" + base64.b64encode(public)


@pytest.fixture
def signed(keypair):
    def make(
        *,
        domain=b"konami.net",
        sender="noreply@konami.net",
        recipient=MAILBOX,
        date=NOW,
        headers=None,
        length=False,
        body="This email is not registered to a KONAMI ID.",
    ):
        raw = (
            f"From: KONAMI <{sender}>\r\nTo: <{recipient}>\r\n"
            f"Subject: [KONAMI ID] Reissue Password\r\nDate: {format_datetime(date)}\r\n"
            "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n"
            f"{body}\r\n"
        ).encode()
        included = headers or SIGNED_HEADERS
        signature = dkim.sign(
            raw,
            b"release",
            domain,
            keypair[0],
            include_headers=included if b"from" in included else SIGNED_HEADERS,
            length=length,
        )
        if b"from" not in included:
            # A compliant signer refuses an unsigned From; model a forged wire tag.
            signature = signature.replace(b"h=from", b"h=unsigned")
        return signature + raw

    return make


@pytest.fixture
def verifier(keypair):
    def local_dns(name, timeout):
        assert name.rstrip(b".") == b"release._domainkey.konami.net"
        assert 0 < timeout <= 1
        return keypair[1]

    return ReleaseOriginVerifier(dnsfunc=local_dns)


async def verify(verifier, raw, **kwargs):
    return await verifier.verify(raw, MAILBOX, START, END, now=NOW, **kwargs)


@pytest.mark.asyncio
async def test_accepts_real_aligned_dkim_signature_with_fresh_bound_headers(verifier, signed):
    assert await verify(verifier, signed()) is True


@pytest.mark.asyncio
async def test_rejects_unsigned_forged_from_and_authentication_results(verifier):
    raw = (
        "Authentication-Results: mailcow.efbazaar.uz; dkim=pass header.d=konami.net\r\n"
        f"From: noreply@konami.net\r\nTo: {MAILBOX}\r\nSubject: [KONAMI ID] Reissue Password\r\n"
        f"Date: {format_datetime(NOW)}\r\n\r\nThis email is not registered to a KONAMI ID.\r\n"
    ).encode()
    assert await verify(verifier, raw) is False


@pytest.mark.asyncio
async def test_rejects_valid_signature_from_an_unaligned_domain(verifier, signed, keypair):
    raw = signed(domain=b"attacker.test")
    assert dkim.verify(raw, dnsfunc=lambda *args, **kwargs: keypair[1])
    assert await verify(verifier, raw) is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "sender", ["other@konami.net", "noreply@konami.net.attacker.test", "noreply@konami.com"]
)
async def test_exact_allowlisted_sender_and_signing_domain_must_match(verifier, signed, sender):
    assert await verify(verifier, signed(sender=sender)) is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "header", [b"from", b"to", b"subject", b"date", b"content-type", b"mime-version"]
)
async def test_rejects_unsigned_critical_or_mime_headers(verifier, signed, header):
    assert (
        await verify(verifier, signed(headers=[h for h in SIGNED_HEADERS if h != header])) is False
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "header",
    [
        b"From: noreply@konami.net",
        b"To: retained@efbazaar.uz",
        b"Date: Tue, 20 Oct 2026 12:00:10 +0000",
        b"Subject: [KONAMI ID] Reissue Password",
        b"Content-Type: text/html",
        b"MIME-Version: 1.0",
    ],
)
async def test_rejects_duplicate_critical_headers(verifier, signed, header):
    assert await verify(verifier, header + b"\r\n" + signed()) is False


@pytest.mark.asyncio
async def test_rejects_old_signed_date_even_when_other_headers_are_fresh(verifier, signed):
    assert await verify(verifier, signed(date=START - timedelta(seconds=1))) is False


@pytest.mark.asyncio
async def test_same_second_date_before_fractional_request_start_fails_closed(verifier, signed):
    assert (
        await verifier.verify(
            signed(date=START), MAILBOX, START + timedelta(microseconds=1), END, now=NOW
        )
        is False
    )


@pytest.mark.asyncio
async def test_rejects_future_signed_date_and_expired_request(verifier, signed):
    assert await verify(verifier, signed(date=NOW + timedelta(seconds=1))) is False
    assert await verifier.verify(signed(), MAILBOX, START, NOW, now=NOW) is False


@pytest.mark.asyncio
async def test_rejects_body_tampering(verifier, signed):
    assert (
        await verify(verifier, signed().replace(b"not registered", b"new attacker instructions"))
        is False
    )


@pytest.mark.asyncio
async def test_rejects_changed_or_different_signed_recipient(verifier, signed):
    assert await verify(verifier, signed(recipient="someoneelse@efbazaar.uz")) is False
    raw = signed(recipient="someoneelse@efbazaar.uz").replace(
        b"someoneelse@efbazaar.uz", MAILBOX.encode()
    )
    assert await verify(verifier, raw) is False


@pytest.mark.asyncio
async def test_rejects_partial_body_signatures_even_before_unsigned_append(verifier, signed):
    assert await verify(verifier, signed(length=True)) is False
    assert await verify(verifier, signed(length=True) + b"unsigned appendix\r\n") is False


@pytest.mark.asyncio
async def test_dns_failure_never_authenticates(signed):
    def fail_dns(*args, **kwargs):
        raise dkim.DnsTimeoutError("local fixture DNS timeout")

    assert await verify(ReleaseOriginVerifier(dnsfunc=fail_dns), signed()) is False


@pytest.mark.asyncio
async def test_rejects_oversized_dns_key_record(signed):
    assert (
        await verify(ReleaseOriginVerifier(dnsfunc=lambda *a, **kw: b"x" * 16_384), signed())
        is False
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["message", "headers", "header_count", "signatures"])
async def test_limits_untrusted_input_before_dns(signed, keypair, kind):
    called = False

    def dns(*args, **kwargs):
        nonlocal called
        called = True
        return keypair[1]

    raw = signed()
    if kind == "message":
        raw += b"x" * (2 * 1024 * 1024)
    elif kind == "headers":
        raw = b"X-Noise: " + b"x" * 65_536 + b"\r\n" + raw
    elif kind == "header_count":
        raw = b"X-Noise: x\r\n" * 201 + raw
    else:
        signature = raw[: raw.index(b"\r\nFrom:") + 2]
        raw = signature * 5 + raw
    assert await verify(ReleaseOriginVerifier(dnsfunc=dns), raw) is False
    assert called is False


@pytest.mark.asyncio
async def test_bounds_parallel_crypto_and_dns_without_queueing_unlimited_work(signed, keypair):
    gate = threading.Event()
    entered = 0
    mutex = threading.Lock()
    loop = asyncio.get_running_loop()
    all_entered = asyncio.Event()

    def dns(*args, **kwargs):
        nonlocal entered
        with mutex:
            entered += 1
            if entered == 4:
                loop.call_soon_threadsafe(all_entered.set)
        gate.wait(2)
        return keypair[1]

    verifier = ReleaseOriginVerifier(dnsfunc=dns)
    tasks = [asyncio.create_task(verify(verifier, signed())) for _ in range(4)]
    try:
        await asyncio.wait_for(all_entered.wait(), 1)
        assert await verify(verifier, signed()) is False
    finally:
        gate.set()
        assert all(await asyncio.gather(*tasks))


@pytest.mark.asyncio
async def test_accepts_known_konami_info_sender_from_deployment_allowlist(verifier, signed):
    assert await verify(verifier, signed(sender="konami-info@konami.net")) is True


@pytest.mark.asyncio
async def test_ignores_unsigned_authentication_results_on_genuinely_signed_mail(verifier, signed):
    raw = b"Authentication-Results: attacker.test; dkim=fail\r\n" + signed()
    assert await verify(verifier, raw) is True


@pytest.mark.asyncio
async def test_can_verify_an_aligned_signature_after_an_unaligned_one(verifier, signed, keypair):
    raw = signed()
    other = dkim.sign(
        raw, b"attacker", b"attacker.test", keypair[0], include_headers=SIGNED_HEADERS
    )
    assert await verify(verifier, other + raw) is True


@pytest.mark.asyncio
@pytest.mark.parametrize("key_size, accepted", [(1024, True), (512, False)])
async def test_enforces_rfc8301_rsa_floor_with_real_signatures(signed, key_size, accepted):
    key = (
        serialization.load_pem_private_key(_RSA512_TEST_KEY, password=None)
        if key_size == 512
        else rsa.generate_private_key(public_exponent=65537, key_size=key_size)
    )
    private = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    public = key.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    raw = signed().split(b"\r\nFrom:", 1)[1]
    raw = b"From:" + raw
    signature = dkim.sign(raw, b"release", b"konami.net", private, include_headers=SIGNED_HEADERS)

    def lookup(*args, **kwargs):
        return b"v=DKIM1; k=rsa; p=" + base64.b64encode(public)

    assert dkim.DKIM(signature + raw, minkey=512).verify(dnsfunc=lookup)
    assert await verify(ReleaseOriginVerifier(dnsfunc=lookup), signature + raw) is accepted


@pytest.mark.asyncio
async def test_timed_out_crypto_keeps_capacity_reserved_until_threads_really_finish(
    signed, keypair, monkeypatch
):
    from smart_admin_worker.imap import release_auth

    monkeypatch.setattr(release_auth, "VERIFY_TIMEOUT_SECONDS", 0.05)
    gate = threading.Event()
    entered = 0
    finished = 0
    mutex = threading.Lock()
    loop = asyncio.get_running_loop()
    all_entered = asyncio.Event()
    all_finished = asyncio.Event()

    def dns(*args, **kwargs):
        nonlocal entered
        with mutex:
            entered += 1
            if entered == 4:
                loop.call_soon_threadsafe(all_entered.set)
        gate.wait(2)
        return keypair[1]

    verifier = ReleaseOriginVerifier(dnsfunc=dns)
    real_verify = verifier._verify

    def observed(*args):
        nonlocal finished
        try:
            return real_verify(*args)
        finally:
            with mutex:
                finished += 1
                if finished == 4:
                    loop.call_soon_threadsafe(all_finished.set)

    monkeypatch.setattr(verifier, "_verify", observed)
    raw = signed()
    tasks = [asyncio.create_task(verify(verifier, raw)) for _ in range(4)]
    try:
        await asyncio.wait_for(all_entered.wait(), 1)
        assert not any(await asyncio.gather(*tasks))
        assert await verify(verifier, raw) is False
        assert entered == 4
    finally:
        gate.set()
        await asyncio.wait_for(all_finished.wait(), 2)


def test_physical_completion_returns_capacity_even_after_caller_loop_closes(
    signed, keypair, monkeypatch
):
    from smart_admin_worker.imap import release_auth

    monkeypatch.setattr(release_auth, "VERIFY_TIMEOUT_SECONDS", 0.05)
    gate = threading.Event()
    entered = threading.Event()
    finished = threading.Event()
    counters = {"entered": 0, "finished": 0}
    mutex = threading.Lock()

    def dns(*args, **kwargs):
        with mutex:
            counters["entered"] += 1
            if counters["entered"] == 4:
                entered.set()
        gate.wait(2)
        return keypair[1]

    verifier = ReleaseOriginVerifier(dnsfunc=dns)
    real_verify = verifier._verify

    def observed(*args):
        try:
            return real_verify(*args)
        finally:
            with mutex:
                counters["finished"] += 1
                if counters["finished"] == 4:
                    finished.set()

    monkeypatch.setattr(verifier, "_verify", observed)
    raw = signed()

    async def timed_out_batch():
        tasks = [asyncio.create_task(verify(verifier, raw)) for _ in range(4)]
        assert await asyncio.to_thread(entered.wait, 1)
        assert not any(await asyncio.gather(*tasks))

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(timed_out_batch())
    finally:
        loop.close()
        gate.set()
        assert finished.wait(2)
    # These independent verifications must not inherit leaked capacity from a
    # closed event loop. All four actual crypto operations have finished.
    clean = ReleaseOriginVerifier(dnsfunc=lambda *a, **kw: keypair[1])
    assert asyncio.run(verify(clean, raw)) is True
