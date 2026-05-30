/**
 * names.ts — Seeded name generation for map entities.
 *
 * RULE: No React. No Zustand. No Math.random(). Pure function.
 * All randomness comes from the caller's PRNG.
 */

// 80 syllables total. First 60 start with a consonant; last 20 start with a vowel.
// Positions 1+ can draw from the full set; position 0 draws only from [0, CONSONANT_COUNT).
const SYLLABLES: readonly string[] = [
  // consonant-starting (indices 0–59)
  'ba', 'mi', 'ta', 'val', 'mor', 'dan', 'sol', 'fa', 'bex', 'ga',
  'tal', 'ri', 'van', 'dax', 'mo', 'sel', 'ko', 'le', 'bri', 'dal',
  'sha', 'pi', 'vo', 'nek', 'zar', 'fe', 'gi', 'tak', 'win', 'sev',
  'do', 'mu', 'ke', 'bra', 'so', 'tel', 'nax', 'pa', 'jo', 'vex',
  'ga', 'cal', 'do', 'fa', 'tra', 'se', 'kom', 'raz', 'va', 'min',
  'to', 'sa', 'ki', 'no', 'pe', 'su', 'rav', 'tev', 'go', 'mir',
  // vowel-starting (indices 60–79)
  'at', 'is', 'en', 'ul', 'or', 'ar', 'ith', 'on', 'ix', 'ur',
  'al', 'es', 'an', 'ot', 'in', 'ax', 'om', 'ir', 'eth', 'av',
];

const CONSONANT_COUNT = 60;

/**
 * Generate a 2- or 3-syllable fantasy place name using the provided PRNG.
 * Deterministic: same PRNG state → same output.
 */
export function generateName(rand: () => number): string {
  const count = rand() < 0.6 ? 2 : 3;
  const syllables: string[] = [];

  // First syllable must start with a consonant
  syllables.push(SYLLABLES[Math.floor(rand() * CONSONANT_COUNT)]);

  for (let i = 1; i < count; i++) {
    let syl: string;
    // Reject consecutive identical syllables
    do {
      syl = SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
    } while (syl === syllables[syllables.length - 1]);
    syllables.push(syl);
  }

  const joined = syllables.join('');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
