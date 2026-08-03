# Card-Interest HMAC Secret Deployment Design

**Date:** 2026-08-03
**Status:** Design approved via brainstorming
**Scope:** Production deployment configuration only

## Purpose

Restore marketplace startup and prevent recurrence by propagating the existing
GitHub Actions repository secret `CARD_INTEREST_HMAC_SECRET` through every
deployment boundary:

```text
GitHub Actions secret -> SSH action environment -> deploy.sh -> server .env
-> Docker Compose -> marketplace-service
```

The marketplace application and Compose service already require and consume
this value. The missing links are the CD workflow and `deploy.sh`.

## Design

1. Add `CARD_INTEREST_HMAC_SECRET` to the SSH action's forwarded `envs` list.
2. Bind the forwarded value to
   `${{ secrets.CARD_INTEREST_HMAC_SECRET }}` in the workflow `env` block.
3. In `deploy.sh`, validate that the value is non-empty before truncating the
   existing server `.env` file.
4. Validate that the value is safe for Docker Compose `.env` interpolation,
   following the existing password and secret handling pattern.
5. Write it to the regenerated `.env` with `upsert_env`.

No application fallback will be introduced. A fallback or newly generated key
on each startup would undermine stable privacy-preserving HMAC identifiers.

## Failure Handling

If the GitHub secret is missing or empty, deployment exits with a clear error
before `deploy.sh` replaces the existing `.env`. This preserves the last known
working configuration and prevents a partial deployment from putting the
marketplace into another crash loop.

The secret value must never be printed in workflow or deployment logs.

## Verification

A focused deployment-contract test will verify that:

- the workflow binds the value from the GitHub `secrets` context;
- the SSH action forwards the variable;
- `deploy.sh` checks it before `.env` truncation;
- `deploy.sh` writes it to `.env`; and
- Docker Compose passes it to `marketplace-service`.

The test will first be run against the current configuration to demonstrate the
missing propagation, then rerun after the minimal fix. Shell syntax validation
and Docker Compose configuration rendering will provide additional checks.

## Deployment

The patch will be committed and pushed on
`codex/fix-card-interest-secret-deploy`, then merged into `main`. Because this
is deployment configuration only, the existing marketplace image does not need
to be rebuilt. Running `CD — Selective Deploy` on `main` with the default
`latest` image tag will regenerate `.env` and recreate the affected container
configuration.
