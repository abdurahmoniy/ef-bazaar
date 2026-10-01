SET lock_timeout = '5s';
-- Recommendation snapshot'lari uchun belgilar (uz.efbazaar:outbox snapshot rejimi).
-- Trigger — Java'dagi har qanday yo'lni, jumladan bulk UPDATE'larni (TrustService, user-deleted)
-- ushlaydi. Belgi shu tranzaksiyada qo'yiladi; relay hozirgi holatni SnapshotSource orqali quradi.
-- marked_at yangilanadi (DO NOTHING emas): relay yuborayotgan paytdagi o'zgarish yo'qolmasin.

CREATE OR REPLACE FUNCTION rec_mark(p_source TEXT, p_entity TEXT) RETURNS void AS $$
BEGIN
    INSERT INTO outbox_snapshot_pending (source, entity_id)
    VALUES (p_source, p_entity)
    ON CONFLICT (source, entity_id) DO UPDATE SET marked_at = clock_timestamp();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rec_mark_listing() RETURNS trigger AS $$
BEGIN
    PERFORM rec_mark('listing', NEW.id::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rec_mark_listing_cards() RETURNS trigger AS $$
BEGIN
    PERFORM rec_mark('listing', COALESCE(NEW.listing_id, OLD.listing_id)::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rec_mark_like() RETURNS trigger AS $$
BEGIN
    PERFORM rec_mark('like', COALESCE(NEW.user_id, OLD.user_id)::text || ':'
                             || COALESCE(NEW.listing_id, OLD.listing_id)::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_rec_snapshot
    AFTER INSERT OR UPDATE OF status, price, seller_id, value_score ON listings
    FOR EACH ROW EXECUTE FUNCTION rec_mark_listing();

CREATE TRIGGER listing_cards_rec_snapshot
    AFTER INSERT OR DELETE ON listing_cards
    FOR EACH ROW EXECUTE FUNCTION rec_mark_listing_cards();

CREATE TRIGGER listing_likes_rec_snapshot
    AFTER INSERT OR DELETE ON listing_likes
    FOR EACH ROW EXECUTE FUNCTION rec_mark_like();
