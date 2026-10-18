-- Boxes an admin registered for a user are that user's own address, not a
-- trade box: they become CUSTOM so they can be linked to an account. They spend
-- no custom slot and never lock (CustomSlotService skips source = 'ADMIN').
UPDATE mailboxes SET kind = 'CUSTOM' WHERE source = 'ADMIN' AND kind = 'RANDOM';
