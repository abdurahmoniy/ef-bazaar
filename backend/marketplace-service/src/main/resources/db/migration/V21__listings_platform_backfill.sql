-- The `platform` attribute (R__attribute_definitions.sql) is required, and the
-- browse filter defaults to MOBILE. Every listing created before the attribute
-- existed is a mobile account (Google Play / Game Center era), so backfill them
-- once — new listings get the value from the create form.
UPDATE listings
   SET attributes = jsonb_set(attributes, '{platform}', '"MOBILE"'::jsonb, TRUE)
 WHERE attributes ->> 'platform' IS NULL;
