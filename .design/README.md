# Dizayn manbalari

Har papka bitta Claude Design kanvasi. Ichida turgani — **manba**:
`*.dc.html` (har biri alohida artboard) va `canvas.json` (joylashuv).

Publish qilinadigan `~2.5 MB` lik yig'ilgan fayl bu yerga **commit
qilinmaydi**: u to'liq shu manbalardan qayta yig'iladi, va har seed
uni noldan yozadi.

## Qayta yig'ish

```bash
node "<design skill base>/seed-canvas.mjs" \
  --template "<design skill base>/payload.template.html" \
  --out platforma-moliyasi.html \
  --title "Platforma moliyasi" \
  --artboard Main.dc.html --artboard Foyda.dc.html --artboard Kartalar.dc.html \
  --canvas canvas.json
```

Keyin `--check <fayl>` bilan tekshirib, Artifact orqali publish qilinadi.

## platforma-moliyasi

Adminka `/admin/payments/cards` sahifasi uchun. Uchta artboard:

| Fayl | Nima |
|---|---|
| `Main.dc.html` | Kartalardagi pul kimniki — foydalanuvchilar puli va platforma ulushi |
| `Foyda.dc.html` | Komissiya, referal mukofoti, xarajat va sof natija |
| `Kartalar.dc.html` | Navbat: qoldiq va aylanma |

Grafik ranglari `#059669` (platforma) va `#6C7FD4` (foydalanuvchilar)
dataviz validatoridan **ikkala rejimda** o'tgan: normal ΔE 21.2,
deuteranopiya 16.3. Kodda ular `frontend/src/lib/payment-analytics.ts`
dagi `MONEY_COLORS` da turadi.

Zarar bu yerda hech qachon qizil emas — referal mukofoti o'sish uchun
qilingan sarf, nosozlik emas.
