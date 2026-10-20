-- Source facts survive deletions/unlikes; no identities are returned by analytics.
CREATE TABLE seller_analytics_collection (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), started_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO seller_analytics_collection(singleton) VALUES (true);
CREATE TABLE seller_analytics_facts (
 source_key text PRIMARY KEY, listing_id uuid NOT NULL, seller_id uuid NOT NULL,
 metric text NOT NULL CHECK(metric IN ('VIEW','SAVE','INQUIRY','TRADE')),
 occurred_at timestamptz NOT NULL, gross_sales_uzs numeric(30,0) NOT NULL DEFAULT 0 CHECK(gross_sales_uzs>=0)
);
CREATE INDEX seller_analytics_facts_owner_time ON seller_analytics_facts(seller_id,occurred_at,listing_id);
CREATE TABLE seller_analytics_daily (
 seller_id uuid NOT NULL,listing_id uuid NOT NULL,day date NOT NULL,
 unique_views bigint NOT NULL DEFAULT 0,save_additions bigint NOT NULL DEFAULT 0,
 inquiries bigint NOT NULL DEFAULT 0,completed_trades bigint NOT NULL DEFAULT 0,
 gross_sales_uzs numeric(40,0) NOT NULL DEFAULT 0,PRIMARY KEY(seller_id,listing_id,day)
);
CREATE FUNCTION seller_analytics_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  UPDATE seller_analytics_daily SET unique_views=unique_views-(OLD.metric='VIEW')::int,
   save_additions=save_additions-(OLD.metric='SAVE')::int,inquiries=inquiries-(OLD.metric='INQUIRY')::int,
   completed_trades=completed_trades-(OLD.metric='TRADE')::int,gross_sales_uzs=gross_sales_uzs-OLD.gross_sales_uzs
  WHERE seller_id=OLD.seller_id AND listing_id=OLD.listing_id AND day=(OLD.occurred_at AT TIME ZONE 'Asia/Samarkand')::date;
 END IF;
 INSERT INTO seller_analytics_daily(seller_id,listing_id,day,unique_views,save_additions,inquiries,completed_trades,gross_sales_uzs)
 VALUES(NEW.seller_id,NEW.listing_id,(NEW.occurred_at AT TIME ZONE 'Asia/Samarkand')::date,
  (NEW.metric='VIEW')::int,(NEW.metric='SAVE')::int,(NEW.metric='INQUIRY')::int,(NEW.metric='TRADE')::int,NEW.gross_sales_uzs)
 ON CONFLICT(seller_id,listing_id,day) DO UPDATE SET unique_views=seller_analytics_daily.unique_views+EXCLUDED.unique_views,
  save_additions=seller_analytics_daily.save_additions+EXCLUDED.save_additions,inquiries=seller_analytics_daily.inquiries+EXCLUDED.inquiries,
  completed_trades=seller_analytics_daily.completed_trades+EXCLUDED.completed_trades,gross_sales_uzs=seller_analytics_daily.gross_sales_uzs+EXCLUDED.gross_sales_uzs;
 RETURN NEW;
END $$;
CREATE TRIGGER seller_analytics_rollup AFTER INSERT OR UPDATE ON seller_analytics_facts FOR EACH ROW EXECUTE FUNCTION seller_analytics_rollup();
CREATE FUNCTION seller_analytics_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; k text; m text;
BEGIN
 SELECT seller_id INTO owner_id FROM listings WHERE id=NEW.listing_id;
 IF TG_TABLE_NAME='listing_views' THEN
  IF NEW.viewer_key='user:'||owner_id::text THEN RETURN NEW; END IF;
  k:='view:'||NEW.listing_id::text||':'||md5(NEW.viewer_key);m:='VIEW';
 ELSIF TG_TABLE_NAME='listing_likes' THEN
  IF NEW.user_id=owner_id OR NEW.created_at<(SELECT started_at FROM seller_analytics_collection) THEN RETURN NEW; END IF;
  k:='save:'||NEW.id::text;m:='SAVE';
 ELSE
  IF NEW.requester_id=owner_id THEN RETURN NEW; END IF;
  k:='inquiry:'||NEW.listing_id::text||':'||NEW.requester_id::text;m:='INQUIRY';
 END IF;
 INSERT INTO seller_analytics_facts(source_key,listing_id,seller_id,metric,occurred_at)
 VALUES(k,NEW.listing_id,owner_id,m,NEW.created_at)
 ON CONFLICT(source_key) DO UPDATE SET occurred_at=EXCLUDED.occurred_at
 WHERE seller_analytics_facts.seller_id=EXCLUDED.seller_id AND EXCLUDED.occurred_at<seller_analytics_facts.occurred_at;
 RETURN NEW;
END $$;
CREATE TRIGGER seller_analytics_views AFTER INSERT ON listing_views FOR EACH ROW EXECUTE FUNCTION seller_analytics_capture();
CREATE TRIGGER seller_analytics_saves AFTER INSERT ON listing_likes FOR EACH ROW EXECUTE FUNCTION seller_analytics_capture();
CREATE TRIGGER seller_analytics_inquiries AFTER INSERT ON chat_account_requests FOR EACH ROW EXECUTE FUNCTION seller_analytics_capture();
-- Only genuinely persisted first-view and per-listing inquiry history exists.
INSERT INTO seller_analytics_facts(source_key,listing_id,seller_id,metric,occurred_at)
 SELECT 'view:'||v.listing_id::text||':'||md5(v.viewer_key),v.listing_id,l.seller_id,'VIEW',v.created_at
 FROM listing_views v JOIN listings l ON l.id=v.listing_id WHERE v.viewer_key<>'user:'||l.seller_id::text;
INSERT INTO seller_analytics_facts(source_key,listing_id,seller_id,metric,occurred_at)
 SELECT 'inquiry:'||r.listing_id::text||':'||r.requester_id::text,r.listing_id,l.seller_id,'INQUIRY',min(r.created_at)
 FROM chat_account_requests r JOIN listings l ON l.id=r.listing_id WHERE r.requester_id<>l.seller_id GROUP BY r.listing_id,r.requester_id,l.seller_id;
-- A receipt is retained even if its listing has not arrived yet. No cross-DB read.
CREATE TABLE seller_analytics_trade_receipts (
 trade_id uuid PRIMARY KEY,idempotency_key text NOT NULL UNIQUE,listing_id uuid NOT NULL,seller_id uuid NOT NULL,
 kind text NOT NULL,mode text NOT NULL,price_uzs numeric(30,0) NOT NULL,completed_at timestamptz NOT NULL,applied_at timestamptz
);
