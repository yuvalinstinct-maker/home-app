"""Shared nutrition math: normalize ingredient amount to grams, compute kcal/protein."""
import json, os

BASE = os.path.join(os.path.dirname(__file__), '..', 'data')
NUT = {i['key']: i for i in json.load(open(os.path.join(BASE, 'nutrition.json')))['items']}
UNITS = json.load(open(os.path.join(BASE, 'nutrition.json')))['units']

def to_grams(amount, unit, item):
    u = UNITS.get(unit)
    if u is None:
        return None
    if 'grams' in u:
        return amount * u['grams']
    # piece
    pg = item.get('piece_grams') if item else None
    return amount * pg if pg else None

def calc_ingredient(ing):
    """ing: {amount, unit, nutrition_key}. Returns (grams, kcal, protein, matched)."""
    item = NUT.get(ing.get('nutrition_key'))
    if not item:
        return None, None, None, False
    g = to_grams(ing.get('amount') or 0, ing.get('unit', ''), item)
    if g is None:
        return None, None, None, False
    kcal = g * item['kcal'] / 100.0
    protein = g * item['protein'] / 100.0
    return g, kcal, protein, True

def calc_recipe(recipe):
    """Returns dict with totals and per-serving values."""
    total_kcal = total_protein = 0.0
    unmatched = []
    for ing in recipe['ingredients']:
        g, kcal, protein, matched = calc_ingredient(ing)
        if not matched:
            unmatched.append(ing['name'])
            continue
        total_kcal += kcal
        total_protein += protein
    servings = recipe.get('servings') or 1
    return {
        'total_kcal': round(total_kcal),
        'total_protein': round(total_protein, 1),
        'kcal_per_serving': round(total_kcal / servings),
        'protein_per_serving': round(total_protein / servings, 1),
        'protein_per_100kcal': round(total_protein / total_kcal * 100, 1) if total_kcal else 0,
        'unmatched': unmatched,
    }

if __name__ == '__main__':
    seed = json.load(open(os.path.join(BASE, 'seed.json')))
    for r in seed['recipes']:
        print(r['title'], '->', calc_recipe(r))
