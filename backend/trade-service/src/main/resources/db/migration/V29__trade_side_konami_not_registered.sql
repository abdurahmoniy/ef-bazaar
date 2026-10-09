-- Konami pochta Konami ID ga ulanmagan bo'lsa ham "Reissue Password"
-- sarlavhasi bilan javob beradi ("This email address is not registered to a
-- KONAMI ID"). Bu sotuvchi akkount emailini platforma qutisiga o'tkazmaganini
-- bildiradi. Savdo shu qadamda qoladi, panel esa shu tarafga emailni
-- o'tkazishni aytadi. Oxirgi rad javobi vaqti.
ALTER TABLE trade_sides ADD COLUMN konami_not_registered_at TIMESTAMPTZ;
