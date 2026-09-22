// Nutrition engine: mirrors scripts/nutrition_calc.py. Values per 100g/ml.
// Catalog is loaded from Supabase (global + household corrections), with bundled fallback.
import FALLBACK from './nutrition_data.js?v=4';

const UNITS = FALLBACK.units;
let CATALOG = null;   // key -> {key,name_he,aliases,kcal,protein,piece_grams,household}

export function loadCatalog(rows) {
  CATALOG = {};
  for (const it of FALLBACK.items) CATALOG[it.key] = {...it, household: false};
  for (const r of rows || []) {
    CATALOG[r.key] = { key: r.key, name_he: r.name_he, aliases: r.aliases || [],
      kcal: Number(r.kcal_per_100), protein: Number(r.protein_per_100),
      piece_grams: r.piece_grams ? Number(r.piece_grams) : null, household: !!r.household_id };
  }
}
export function catalog() { if (!CATALOG) loadCatalog([]); return CATALOG; }

export function matchIngredient(name) {
  const cat = catalog();
  const n = (name || '').trim();
  if (!n) return null;
  for (const k in cat) if (cat[k].name_he === n) return cat[k];
  for (const k in cat) if ((cat[k].aliases || []).includes(n)) return cat[k];
  // substring both ways, longest name first for stability
  const keys = Object.keys(cat).sort((a, b) => cat[b].name_he.length - cat[a].name_he.length);
  for (const k of keys) {
    const it = cat[k];
    if (n.includes(it.name_he) || it.name_he.includes(n)) return it;
    for (const a of it.aliases || []) if (a && (n.includes(a) || a.includes(n))) return it;
  }
  return null;
}

export function toGrams(amount, unit, item) {
  const u = UNITS[unit];
  if (!u) return null;
  if (u.grams) return amount * u.grams;
  const pg = item && item.piece_grams;
  return pg ? amount * pg : null;
}

export function calcIngredient(ing) {
  // ing: {name, amount, unit, nutrition_key?}
  const item = ing.nutrition_key ? catalog()[ing.nutrition_key] : matchIngredient(ing.name);
  if (!item) return { matched: false };
  const g = toGrams(Number(ing.amount) || 0, ing.unit || '', item);
  if (g == null) return { matched: false };
  return { matched: true, key: item.key, grams: g,
    kcal: g * item.kcal / 100, protein: g * item.protein / 100 };
}

export function calcRecipe(ingredients, servings) {
  let kcal = 0, protein = 0; const unmatched = [];
  const details = (ingredients || []).map(ing => {
    const c = calcIngredient(ing);
    if (!c.matched) { unmatched.push(ing.name); return { ...ing, matched: false }; }
    kcal += c.kcal; protein += c.protein;
    return { ...ing, matched: true, grams: c.grams, kcal: c.kcal, protein: c.protein, key: c.key };
  });
  const s = servings || 1;
  return {
    details, unmatched,
    total_kcal: Math.round(kcal), total_protein: Math.round(protein * 10) / 10,
    kcal_per_serving: Math.round(kcal / s), protein_per_serving: Math.round(protein / s * 10) / 10,
    protein_per_100kcal: kcal ? Math.round(protein / kcal * 1000) / 10 : 0,
  };
}

// Package-fit: suggest an amount that finishes a package.
// pkgs: list of {sizeGrams} matching this ingredient; returns suggestion or null.
export function packageFit(amountGrams, pkgGrams) {
  if (!pkgGrams || !amountGrams) return null;
  const n = Math.round(amountGrams / pkgGrams);
  const cands = [Math.max(1, n), n + 1].map(k => k * pkgGrams);
  for (const c of cands) {
    const diff = Math.abs(c - amountGrams) / amountGrams;
    if (diff <= 0.15 && c !== amountGrams) return c;
  }
  return null;
}
