import { isKnownUnitWord, resolveUnit } from './units';

export interface ParsedIngredient {
  raw: string;
  quantity: number | null;
  /** Unit word as written (normalised to the canonical unit when it is a known measure). */
  unit: string | null;
  name: string;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

/** Replace "1½" with "1 1/2" style text, so one number grammar handles everything. */
function normalise(text: string): string {
  let s = text.replace(/[\u00a0\u2009\u202f]/g, ' ').trim();
  s = s.replace(/(\d)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, '$1 $2');
  s = s.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (m) => ` ${UNICODE_FRACTIONS[m]} `);
  return s.replace(/\s+/g, ' ').trim();
}

const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?`;
const LEADING_QTY = new RegExp(String.raw`^(${NUM}|\d*\.\d+)(?:\s*(?:-|–|—|to)\s*(${NUM}))?`);

function toNumber(s: string): number {
  const parts = s.trim().split(/\s+/);
  let total = 0;
  for (const p of parts) {
    if (p.includes('/')) {
      const [a, b] = p.split('/').map(Number);
      total += b ? a / b : 0;
    } else total += Number(p);
  }
  return total;
}

/**
 * Split "1 1/2 cups all-purpose flour, sifted" into quantity, unit and name.
 * Ranges ("2-3 cloves") use the upper bound so shopping lists do not run short.
 */
export function parseIngredient(rawInput: string): ParsedIngredient {
  const raw = rawInput.trim();
  let s = normalise(raw);
  let quantity: number | null = null;

  const m = LEADING_QTY.exec(s);
  if (m) {
    const first = toNumber(m[1]);
    quantity = m[2] ? toNumber(m[2]) : first;
    s = s.slice(m[0].length).trim();
  }

  // Parenthetical notes like "(14 oz)" or "(optional)" are not part of the name.
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  let unit: string | null = null;
  if (quantity !== null) {
    const two = s.split(' ').slice(0, 2).join(' ').toLowerCase();
    const words = s.split(' ');
    if (two === 'fl oz' || two === 'fluid ounce' || two === 'fluid ounces') {
      unit = 'fl oz';
      s = words.slice(2).join(' ');
    } else if (words[0] && isKnownUnitWord(words[0].replace(/[.,]$/, ''))) {
      unit = resolveUnit(words[0].replace(/[.,]$/, '')).canonical || words[0];
      s = words.slice(1).join(' ');
    }
  }

  s = s.replace(/^of\s+/i, '');
  // Preparation notes after a comma ("chopped", "to taste") are dropped from the name.
  const name = s.split(',')[0].replace(/\s+/g, ' ').trim();
  return { raw, quantity, unit, name: name || raw };
}
