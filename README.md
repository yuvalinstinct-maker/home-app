# הבית שלנו (home-app)

אפליקציית בית משותפת ליובל ורון: מזווה, מתכונים עם הערכת קלוריות/חלבון, תכנון שבועי ורשימת קניות חיה.

## ארכיטקטורה
- **Frontend**: HTML/CSS/JS סטטי (ES modules, בלי build), PWA עם offline shell + IndexedDB outbox.
- **Backend**: Supabase (Postgres + Auth OTP + Realtime + RLS). כל טבלה household-scoped.
- **Hosting**: GitHub Pages.

## פיתוח
- `data/nutrition.json` - קטלוג תזונה (מקור אמת) → `js/nutrition_data.js` נוצר ממנו.
- `supabase/schema.sql` + `supabase/seed.sql` - סכמה ו-seed; `scripts/gen_seed_sql.py` מייצר מחדש.
- `tests/` - smoke tests (Node).

## ערכים
- RTL מלא, עברית, מחירון משוער תמיד עם ≈ ושקיפות לחישוב.
- בלי AI גנרטיבי, בלי ברקוד ב-V1.
