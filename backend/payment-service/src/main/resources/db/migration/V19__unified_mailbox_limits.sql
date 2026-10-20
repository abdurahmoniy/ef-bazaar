-- New key has total-pool semantics. Legacy mailbox.slots stays unchanged:
-- an old random-only consumer must never receive 10 random + 2 custom grants.
INSERT INTO plan_entitlements (plan_code, key, value, updated_at) VALUES
    ('STANDARD', 'mailbox.total_slots', '3', now()),
    ('PRO', 'mailbox.total_slots', '10', now()),
    ('STAFF', 'mailbox.total_slots', NULL, now())
ON CONFLICT (plan_code, key) DO NOTHING;

-- MAX is no longer sold. Preserve its historical combined allowance,
-- including explicit unlimited values, for existing subscribers.
INSERT INTO plan_entitlements (plan_code, key, value, updated_at)
SELECT 'MAX', 'mailbox.total_slots',
       CASE WHEN r.value IS NULL OR c.value IS NULL THEN NULL
            ELSE LEAST(r.value::numeric + c.value::numeric, 9223372036854775807)::text END,
       now()
FROM plan_entitlements r JOIN plan_entitlements c ON c.plan_code = r.plan_code
WHERE r.plan_code = 'MAX' AND r.key = 'mailbox.slots' AND c.key = 'mailbox.custom_slots'
ON CONFLICT (plan_code, key) DO NOTHING;

-- A named mailbox consumes one total slot; these are creation sublimits.
UPDATE plan_entitlements SET value='2', updated_by=NULL, updated_at=now()
WHERE plan_code='PRO' AND key='mailbox.custom_slots';
UPDATE plan_entitlements SET value='0', updated_by=NULL, updated_at=now()
WHERE plan_code='STANDARD' AND key='mailbox.custom_slots';
