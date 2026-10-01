SET lock_timeout = '5s';

-- ListingStatus.BLOCKED (trust blacklist: sotuvchi bloklansa ACTIVE e'lonlari
-- yashiriladi, blok olinganda qaytariladi) V1 CHECK'iga hech qachon qo'shilmagan
-- edi — faol e'loni bor sotuvchini bloklash constraint xatosi bilan butunlay
-- rollback bo'lardi. ListingStatusConstraintIT shu ro'yxatni enum bilan qo'riqlaydi.
ALTER TABLE listings DROP CONSTRAINT chk_listings_status;
ALTER TABLE listings ADD CONSTRAINT chk_listings_status
    CHECK (status IN ('ACTIVE', 'SOLD', 'DELETED', 'BLOCKED'));
