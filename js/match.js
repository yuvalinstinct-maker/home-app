// Pantry-recipe matching + shared formatting.
export function norm(s) { return (s || '').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim(); }

export function pantryHas(ingName, pantry) {
  const n = norm(ingName);
  if (!n) return false;
  return pantry.some(p => {
    const pn = norm(p.name);
    if (!pn) return false;
    if (pn === n || pn.includes(n) || n.includes(pn)) return true;
    // word-level overlap for two-word names (e.g. "משקה חלבון" vs "משקה חלבון שוקולד 350 מל")
    const pw = pn.split(' ').filter(w => w.length > 2 && !/^\d/.test(w));
    const iw = n.split(' ').filter(w => w.length > 2);
    const hit = iw.filter(w => pw.includes(w));
    return iw.length > 0 && hit.length === iw.length;
  });
}

export function pantryMatch(ingredients, pantry) {
  const have = [], missing = [];
  for (const ing of ingredients || []) {
    if (pantryHas(ing.name, pantry)) have.push(ing); else missing.push(ing);
  }
  const total = (ingredients || []).length;
  return { have, missing, ratio: total ? have.length / total : 0 };
}

export function fmtKcalProtein(calc) {
  return `≈${calc.kcal_per_serving} קק״ל · ${calc.protein_per_serving}g חלבון`;
}
