/**
 * Shep deterministic mock-data generators.
 *
 * Every scaffold ships with realistic sample data so the first render
 * doesn't look like lorem ipsum. Generators are deterministic — the
 * same seed always returns the same output — so screenshots and
 * snapshot tests are stable.
 *
 * Use these INSTEAD of inventing names, copy, or prices yourself.
 */

import { avatarGradients } from './theme';

/** Fast string hash → positive integer. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const FIRST_NAMES = [
  'Avery',
  'Blake',
  'Camila',
  'Devon',
  'Eliza',
  'Finn',
  'Grace',
  'Hana',
  'Ivy',
  'Jordan',
  'Kai',
  'Luna',
  'Malik',
  'Nora',
  'Omar',
  'Priya',
  'Quinn',
  'Reese',
  'Sasha',
  'Tomás',
  'Uma',
  'Violet',
  'Wren',
  'Xavi',
  'Yusuf',
  'Zara',
];

const LAST_NAMES = [
  'Alvarez',
  'Brennan',
  'Choi',
  'Dubois',
  'Eze',
  'Fernandez',
  'Gupta',
  'Hassan',
  'Ishida',
  'Jenkins',
  'Khatri',
  'Lindqvist',
  'Moreno',
  'Nakamura',
  "O'Connell",
  'Park',
  'Quiñones',
  'Rahman',
  'Silva',
  'Tahir',
  'Uehara',
  'Vasquez',
  'Wallace',
  'Yoshida',
];

/** Deterministic realistic full name from an opaque seed. */
export function pickName(seed: string): string {
  const h = hash(seed);
  const first = FIRST_NAMES[h % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(h / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

/** Deterministic initials (1–2 chars) from a seed. */
export function pickInitials(seed: string): string {
  const name = pickName(seed);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
}

/** Deterministic Tailwind gradient class for an Avatar fallback. */
export function pickAvatar(seed: string): (typeof avatarGradients)[number] {
  return avatarGradients[hash(seed) % avatarGradients.length]!;
}

/** Deterministic Date `offsetMinutes` minutes in the past. */
export function pickTimestamp(offsetMinutes: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - offsetMinutes * 60_000);
}

/** Deterministic integer price in [min, max]. */
export function pickPrice(seed: string, min = 10, max = 499): number {
  const h = hash(seed);
  return min + (h % (max - min + 1));
}

const PARAGRAPHS = [
  'Just finished tweaking the onboarding flow — cut it from five screens down to two and the drop-off on step one is already looking way better.',
  "Weekend plan: ride the coast, eat too many tacos, and finally read the book I've been carrying around for a month.",
  'New espresso machine arrived. I have opinions about water temperature that nobody asked for.',
  'Shipped the dark-mode patch last night. The violet on the primary button feels exactly right in a dim room.',
  'Got feedback that the search bar was hard to find on mobile. Moving it above the fold in the next release — small change, big unlock.',
  'Coffee shop wifi is the unofficial co-working space of every indie dev I know.',
  'Prototype is held together with tape but the animation feels right. That counts for a lot at this stage.',
  "Learning to say 'not in this sprint' without guilt. Month three of that lesson.",
];

/** Deterministic realistic paragraph (NOT lorem ipsum). */
export function pickParagraph(seed: string): string {
  return PARAGRAPHS[hash(seed) % PARAGRAPHS.length]!;
}
