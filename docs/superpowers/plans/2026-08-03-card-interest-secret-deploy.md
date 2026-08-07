# Card-Interest HMAC Secret Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propagate the existing `CARD_INTEREST_HMAC_SECRET` GitHub Actions secret into the marketplace container and stop deployment safely if it is missing.

**Architecture:** The CD workflow forwards the repository secret through the SSH action, and `deploy.sh` validates and persists it before Docker Compose recreates services. A focused shell contract test protects every boundary in this configuration chain without reading or printing the secret value.

**Tech Stack:** GitHub Actions YAML, Bash, Docker Compose

---

## File Map

- Create `scripts/test-card-interest-secret-deploy.sh`: static deployment-contract regression test for the secret propagation chain and validation order.
- Modify `.github/workflows/deploy.yml`: bind the repository secret and forward it through `appleboy/ssh-action`.
- Modify `deploy.sh`: require, validate, and write the secret before replacing the server `.env`.
- Existing `docker-compose.yml`: verification target only; it already passes the variable to `marketplace-service`.

### Task 0: Synchronize With Production Main

**Files:**
- Rebase: branch `codex/fix-card-interest-secret-deploy`

- [ ] **Step 1: Rebase the planning commits onto current production main**

Run:

```bash
git rebase origin/main
```

Expected: the design and implementation-plan commits are replayed after
`origin/main` with no conflicts, and `git rev-list --left-right --count
HEAD...origin/main` reports `2 0` before implementation begins.

### Task 1: Add the Failing Deployment-Contract Test

**Files:**
- Create: `scripts/test-card-interest-secret-deploy.sh`
- Test: `scripts/test-card-interest-secret-deploy.sh`

- [ ] **Step 1: Create the focused contract test**

```bash
#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflow="$repo_root/.github/workflows/deploy.yml"
deploy="$repo_root/deploy.sh"
compose="$repo_root/docker-compose.yml"

grep -Eq '^[[:space:]]+envs:.*CARD_INTEREST_HMAC_SECRET' "$workflow"
grep -Fq 'CARD_INTEREST_HMAC_SECRET: ${{ secrets.CARD_INTEREST_HMAC_SECRET }}' "$workflow"
grep -Fq 'require_env CARD_INTEREST_HMAC_SECRET "${CARD_INTEREST_HMAC_SECRET:-}"' "$deploy"
grep -Fq 'upsert_env .env CARD_INTEREST_HMAC_SECRET "$CARD_INTEREST_HMAC_SECRET"' "$deploy"
grep -Fq 'CARD_INTEREST_HMAC_SECRET: ${CARD_INTEREST_HMAC_SECRET}' "$compose"

require_line="$(grep -nF 'require_env CARD_INTEREST_HMAC_SECRET "${CARD_INTEREST_HMAC_SECRET:-}"' "$deploy" | head -1 | cut -d: -f1)"
truncate_line="$(grep -nF ': > .env' "$deploy" | head -1 | cut -d: -f1)"

if (( require_line >= truncate_line )); then
  echo "CARD_INTEREST_HMAC_SECRET must be validated before .env is replaced" >&2
  exit 1
fi

echo "card-interest secret deployment contract: PASS"
```

- [ ] **Step 2: Make the test executable**

Run:

```bash
chmod +x scripts/test-card-interest-secret-deploy.sh
```

Expected: command exits `0`.

- [ ] **Step 3: Run the test and verify the current deployment gap**

Run:

```bash
scripts/test-card-interest-secret-deploy.sh
```

Expected: non-zero exit at the workflow forwarding check because
`CARD_INTEREST_HMAC_SECRET` is not yet present in the SSH action's `envs` list.

### Task 2: Propagate and Validate the Secret

**Files:**
- Modify: `.github/workflows/deploy.yml:59-105`
- Modify: `deploy.sh:38-118`
- Test: `scripts/test-card-interest-secret-deploy.sh`

- [ ] **Step 1: Forward the secret through the CD workflow**

Append `CARD_INTEREST_HMAC_SECRET` to the SSH action's comma-separated `envs`
value, then add this binding alongside the existing `JWT_SECRET` binding:

```yaml
          CARD_INTEREST_HMAC_SECRET:   ${{ secrets.CARD_INTEREST_HMAC_SECRET }}
```

- [ ] **Step 2: Add a reusable required-environment validator**

Add this helper immediately after `assert_safe_for_env`:

```bash
require_env() {
  local key="$1" val="$2"
  if [[ -z "$val" ]]; then
    echo "!! $key must be configured" >&2
    return 1
  fi
}
```

- [ ] **Step 3: Validate before replacing `.env`**

At the beginning of `write_env`, before the status message and `: > .env`, add:

```bash
  require_env CARD_INTEREST_HMAC_SECRET "${CARD_INTEREST_HMAC_SECRET:-}"
  assert_safe_for_env CARD_INTEREST_HMAC_SECRET "$CARD_INTEREST_HMAC_SECRET"
```

This makes a missing secret abort the `set -e` deployment while the previous
server `.env` is still intact.

- [ ] **Step 4: Persist the secret in the regenerated `.env`**

After the JWT settings, add:

```bash
  upsert_env .env CARD_INTEREST_HMAC_SECRET "$CARD_INTEREST_HMAC_SECRET"
```

- [ ] **Step 5: Run the contract test and verify it passes**

Run:

```bash
scripts/test-card-interest-secret-deploy.sh
```

Expected:

```text
card-interest secret deployment contract: PASS
```

- [ ] **Step 6: Validate shell and Compose syntax**

Run:

```bash
bash -n deploy.sh scripts/test-card-interest-secret-deploy.sh
docker compose --env-file .env.example config --quiet
```

Expected: both commands exit `0` without printing any secret value.

- [ ] **Step 7: Review the complete change**

Run:

```bash
git diff --check
git diff -- .github/workflows/deploy.yml deploy.sh scripts/test-card-interest-secret-deploy.sh
```

Expected: no whitespace errors; the diff contains only the secret propagation,
fail-fast validation, and regression test.

- [ ] **Step 8: Commit the production fix**

```bash
git add .github/workflows/deploy.yml deploy.sh scripts/test-card-interest-secret-deploy.sh
git commit -m "fix(deploy): propagate card-interest HMAC secret"
```

### Task 3: Final Verification and Push

**Files:**
- Verify: `.github/workflows/deploy.yml`
- Verify: `deploy.sh`
- Verify: `docker-compose.yml`
- Verify: `scripts/test-card-interest-secret-deploy.sh`

- [ ] **Step 1: Re-run fresh verification from the committed tree**

Run:

```bash
scripts/test-card-interest-secret-deploy.sh
bash -n deploy.sh scripts/test-card-interest-secret-deploy.sh
docker compose --env-file .env.example config --quiet
git status --short --branch
```

Expected: contract test prints `PASS`; syntax and Compose checks exit `0`; Git
status is clean and shows branch `codex/fix-card-interest-secret-deploy` ahead
of `origin/main` by the design and implementation commits.

- [ ] **Step 2: Push the production-fix branch**

Run:

```bash
git push -u origin codex/fix-card-interest-secret-deploy
```

Expected: GitHub accepts the branch and reports it tracking
`origin/codex/fix-card-interest-secret-deploy`.
