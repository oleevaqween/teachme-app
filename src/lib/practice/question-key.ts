import { normalizeQuestion } from '@/lib/cv-studio/workspace-rules';

// FNV-1a 64-bit; BigInt() calls (not literals) because the TypeScript target is ES2017.
const OFFSET = BigInt('0xcbf29ce484222325');
const PRIME = BigInt('0x100000001b3');
const MASK = BigInt('0xffffffffffffffff');

/** Stable key for a CV Studio pack question; the same normalisation keeps history across pack regeneration. */
export function packQuestionKey(text: string): string {
  let hash = OFFSET;
  for (const byte of new TextEncoder().encode(normalizeQuestion(text))) {
    hash ^= BigInt(byte);
    hash = (hash * PRIME) & MASK;
  }
  return 'pack:' + hash.toString(16).padStart(16, '0');
}

export function extraQuestionKey(id: string): string {
  return 'extra:' + id;
}
