/** Recover the original quotation after whitespace/typographic-quote changes only.
 * No paraphrase, case folding, number conversion or cross-source reassignment. */
export function sourceQuote(source: string | undefined, quote: string): string | null {
  if (!source || !quote.trim()) return null;
  if (source.includes(quote)) return quote;
  const normalize = (text: string) => {
    let value = '';
    const starts: number[] = [], ends: number[] = [];
    for (let i = 0; i < text.length; i++) {
      let char = text[i].replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
      if (/\s/.test(char)) char = ' ';
      if (char === ' ' && value.endsWith(' ')) { ends[ends.length - 1] = i + 1; continue; }
      value += char; starts.push(i); ends.push(i + 1);
    }
    return { value, starts, ends };
  };
  const normalized = normalize(source), needle = normalize(quote).value.trim();
  const at = normalized.value.indexOf(needle);
  return at < 0 ? null : source.slice(normalized.starts[at], normalized.ends[at + needle.length - 1]);
}
