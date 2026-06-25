# efBazaar — Turnir Web App

eFootball hamjamiyati uchun turnir platformasi. Chempionat-X bot bilan integratsiya.

## Ishga tushirish

```bash
# 1. Dependencylarni o'rnat
npm install

# 2. ENV faylini yarating
cp .env.local.example .env.local
# .env.local ichida API URL'ni to'g'rilang

# 3. Dev serverni ishga tushiring
npm run dev
```

Brauzerda: http://localhost:3000

## Papka strukturasi

```
src/
├── app/
│   ├── globals.css       # Design tokens va global stilllar
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Bosh sahifa
├── components/
│   ├── layout/
│   │   └── AppShell.tsx  # Header + tab navigatsiya
│   ├── tournament/
│   │   └── TournamentList.tsx
│   └── match/
│       └── MatchList.tsx
├── lib/
│   └── api.ts            # Java API bilan ulanish
└── types/
    └── index.ts          # TypeScript typelar
```

## API integratsiya

`src/lib/api.ts` da barcha endpoint'lar tayyor.
Mock datadan real API'ga o'tish:

```tsx
// TournamentList.tsx ichida:
// Mock:
const [tournaments] = useState(MOCK_TOURNAMENTS);

// Real API:
const [tournaments, setTournaments] = useState([]);
useEffect(() => {
  api.tournaments.list().then(setTournaments);
}, []);
```

## Keyingi qadamlar

- [ ] Auth (do'stim bilan)
- [ ] Tournament detail sahifasi (bracket, standings)
- [ ] Admin panel (natija tasdiqlash)
- [ ] Turnirga qo'shilish flow'i
