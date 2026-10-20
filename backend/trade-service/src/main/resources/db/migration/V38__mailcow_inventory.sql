-- Inventory is observation only. No automatic ownership assignment or deletion.
CREATE TABLE mailbox_inventory_runs (
 id UUID PRIMARY KEY, sequence BIGSERIAL UNIQUE NOT NULL,
 domains JSONB NOT NULL, requested_at TIMESTAMPTZ NOT NULL,
 status VARCHAR(16) NOT NULL CHECK(status IN ('PENDING','SENT','RECEIVING','COMPLETE','ERROR')),
 observed_at TIMESTAMPTZ, last_page INTEGER CHECK(last_page BETWEEN 0 AND 99), error TEXT,
 next_dispatch_at TIMESTAMPTZ NOT NULL, dispatched_at TIMESTAMPTZ,
 dispatch_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX mailbox_inventory_dispatch ON mailbox_inventory_runs(next_dispatch_at)
 WHERE status IN ('PENDING','SENT','RECEIVING');
CREATE TABLE mailbox_inventory_pages (
 request_id UUID NOT NULL REFERENCES mailbox_inventory_runs(id),
 page INTEGER NOT NULL CHECK(page BETWEEN 0 AND 99),
 last_page BOOLEAN NOT NULL, mailboxes JSONB NOT NULL,
 PRIMARY KEY(request_id,page)
);
CREATE TABLE mailbox_inventory_current (
 email VARCHAR(255) PRIMARY KEY,
 used_bytes BIGINT CHECK(used_bytes >= 0), quota_bytes BIGINT CHECK(quota_bytes >= 0),
 active BOOLEAN, mailcow_present BOOLEAN NOT NULL,
 observed_at TIMESTAMPTZ NOT NULL, usage_observed_at TIMESTAMPTZ,
 request_id UUID NOT NULL REFERENCES mailbox_inventory_runs(id)
);
