// src/lib/teaching-session-engine/lesson-style.ts
//
// Client-safe: the writing-style rule given to the AI for lessons and replies, and a
// mechanical safety net that removes any em dash it still writes. Applied to new
// lessons before they are saved (and to the text while it streams, so it does not
// change on screen when the reply finishes). Lessons already saved are not changed.

const EM = '—';

/** Added to every Teach Me lesson and reply prompt. Contains no em dash itself, since models copy the style of their instructions. */
export const LESSON_STYLE_RULE =
  'Writing style: never use the em dash character. Where you would use one, write a comma, a colon, a full stop or brackets instead. Write number ranges with a hyphen (20-40%).';

const HEADING = /^\s{0,3}#{1,6}\s/;
// A bold label at the start of a line or list item: "1. **Trust** —", "- **Trust** —", "**Trust** —".
const BOLD_LABEL = new RegExp(`^(\\s*(?:[-*+]\\s+|\\d+[.)]\\s+)?\\*\\*[^*\\n]+\\*\\*)\\s*${EM}\\s*`);
const RANGE = new RegExp(`(\\d[\\d.,]*%?)[ \\t]*${EM}[ \\t]*(?=\\d)`, 'g');
const LINE_START = new RegExp(`^(\\s*)${EM}+[ \\t]*`);
const TABLE_CELL = new RegExp(`\\|([ \\t]*)${EM}([ \\t]*)(?=\\|)`, 'g');
// Two spaced dashes around a short aside within one sentence become brackets.
const PAIR = new RegExp(` ${EM} ([^${EM}\\n.!?]{1,80}?) ${EM} `, 'g');
const ANY = new RegExp(`[ \\t]*${EM}+[ \\t]*`, 'g');

function fixLine(line: string): string {
  if (!line.includes(EM)) return line;
  let text = line;
  if (HEADING.test(text)) text = text.replace(new RegExp(`[ \\t]*${EM}+[ \\t]*(?=\\S)`, ''), ': ');
  text = text.replace(BOLD_LABEL, '$1: ');
  text = text.replace(RANGE, '$1-');
  text = text.replace(LINE_START, '$1- ');
  text = text.replace(TABLE_CELL, '|$1-$2');
  text = text.replace(PAIR, ' ($1) ');
  text = text.replace(ANY, ', ');
  // Tidy what a comma swap can leave behind.
  return text
    .replace(/,\s*([,.;:!?)])/g, '$1')
    .replace(/([(:])\s*,\s*/g, '$1 ')
    .replace(/\(\s+/g, '(')
    .replace(/^(\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)?),\s*/, '$1')
    .replace(/[ \t]*,[ \t]*$/, '')
    .replace(/(\S)[ \t]{2,}/g, '$1 ');
}

/** The text with every em dash replaced by ordinary punctuation; fenced code blocks are left as written. */
export function removeEmDashes(text: string): string {
  if (!text.includes(EM)) return text;
  let inCode = false;
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inCode = !inCode;
        return line;
      }
      return inCode ? line : fixLine(line);
    })
    .join('\n');
}
