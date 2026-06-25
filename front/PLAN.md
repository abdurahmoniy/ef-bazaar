# efBazaar — Design Plan

## Brief
Turnir platformasi, eFootball o'yinchilar uchun, Uzbekistan.
Auditoriya: yoshlar, mobil o'yinchilar, kiber-sport muhiti.
Sahifaning ishi: turnirlarni ko'rish, ularga qo'shilish, natijalarni kuzatish.

## Color palette
- bg-deep:     #0B0E17  (qora-ko'k, futbol tungi stadion)
- bg-card:     #131926  (karta fonlari)
- bg-subtle:   #1C2233  (ikkinchi daraja)
- accent-lime: #B8FF4F  (neon-yashil, eFootball UI rangi, CTA)
- accent-dim:  #7AB82E  (hover holat)
- text-primary:#F0F4FF
- text-muted:  #6B7A99
- border:      #252D40

## Typography
- Display:  "Space Grotesk" (bold, futbol raqamlariga mos, burchakli)
- Body:     "Inter"
- Mono:     "JetBrains Mono" (natijalar, hisoblar, raqamlar)

## Layout concept
- Mobile-first, dark
- Turnirlar — karta asosidagi grid
- Jadval (standings) — vertikal yuzalar, aniq qatorlar
- Sidebar yo'q — tab navigation (Turnirlar / Matchlar / Jadval)

## Signature element
Har bir turnir kartasida LIVE bo'lsa neon pulse animatsiya,
match natijalari JetBrains Mono bilan katta ko'rsatiladi: "3 — 1"
