# Eismo Pulsas

Eismo įvykių žemėlapis ir statistika Lietuvoje.

## Paleidimas lokaliai

```bash
git clone https://github.com/EismoPulsas/eismopulsas.git
cd eismopulsas
npm install
npx vercel link          # susieti su Vercel projektu
npx vercel env pull .env.local   # parsisiųsti DATABASE_URL
npm run dev
```

Atidaryti http://localhost:3000. Be `DATABASE_URL` žemėlapis rodo pavyzdinius duomenis.

## Struktūra

- `app/page.tsx` – pagrindinis puslapis
- `components/AccidentMap.tsx` – žemėlapis, taškai ir legenda
- `app/api/accidents/route.ts` – API (`GET /api/accidents`)
- `db/schema.sql` – duomenų bazės lentelė ir pavyzdiniai duomenys

## Darbo tvarka

1. `git checkout main && git pull`
2. `git checkout -b feature/tavo-uzduotis`
3. Commit, push, atidaryti Pull Request GitHub'e
4. Patikrinti Vercel preview nuorodą, tada merge
