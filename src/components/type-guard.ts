/**
 * Shared type-scale checks for the per-area guard tests. Imported only by tests.
 */

export const STOCK_SIZE = /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/
export const ARBITRARY_SIZE = /\btext-\[(\d+(\.\d+)?|\.\d+)(px|rem|em|pt)\]/

/** Index just past the string literal that opens at src[start]. */
function skipString(src: string, start: number): number {
  const quote = src[start]
  let i = start + 1
  while (i < src.length) {
    if (src[i] === "\\") i += 2
    else if (src[i] === quote) return i + 1
    else i++
  }
  return src.length
}

/** Index just past the bracket group that opens at src[start]; strings are skipped. */
function skipGroup(src: string, start: number): number {
  const open = src[start]
  const close = open === "{" ? "}" : ")"
  let depth = 0
  let i = start
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i)
      continue
    }
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return i + 1
    }
    i++
  }
  return src.length
}

/** Contents of every string literal found at code level inside code. */
function stringsIn(code: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < code.length) {
    const c = code[i]
    if (c === '"' || c === "'" || c === "`") {
      const end = skipString(code, i)
      out.push(code.slice(i + 1, end - 1))
      i = end
    } else i++
  }
  return out
}

/**
 * Class strings: the value of each className= attribute (string, template
 * literal or braced expression) and the arguments of each cn() or clsx() call.
 * Quotes in JSX text are never read, because scanning only starts at these anchors.
 */
export function extractClassStrings(src: string): string[] {
  const out: string[] = []
  const covered: Array<[number, number]> = []
  const attr = /\bclassName\s*=\s*/g
  let m: RegExpExecArray | null
  while ((m = attr.exec(src))) {
    const start = m.index + m[0].length
    const c = src[start]
    if (c === '"' || c === "'" || c === "`") {
      const end = skipString(src, start)
      out.push(src.slice(start + 1, end - 1))
    } else if (c === "{") {
      const end = skipGroup(src, start)
      covered.push([start, end])
      out.push(...stringsIn(src.slice(start + 1, end - 1)))
    }
  }
  const call = /\b(?:cn|clsx)\s*\(/g
  while ((m = call.exec(src))) {
    const start = m.index + m[0].length - 1
    if (covered.some(([a, b]) => start > a && start < b)) continue
    out.push(...stringsIn(src.slice(start + 1, skipGroup(src, start) - 1)))
  }
  return out
}

/** Class strings that contain text-label but neither uppercase nor a tracking- class. */
export function labelViolations(src: string): string[] {
  return extractClassStrings(src).filter((s) => {
    const tokens = s.split(/\s+/)
    return (
      tokens.includes("text-label") &&
      !tokens.some((t) => t === "uppercase" || t.startsWith("tracking-"))
    )
  })
}

/** Opening tags of h1, h2 and h3 elements, through the closing angle bracket. */
export function headingOpenTags(src: string): string[] {
  const tags: string[] = []
  const re = /<h[123]\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let depth = 0
    let i = m.index
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === "{") depth++
      else if (c === "}") depth--
      else if (c === ">" && depth === 0 && src[i - 1] !== "=") break
    }
    tags.push(src.slice(m.index, i + 1))
  }
  return tags
}

const HEADING_BAD = /\bfont-bold\b|\bfont-semibold\b|\btracking-tight\b/

/**
 * Human-readable violations of the shared type scale. Each message starts with
 * its rule name: "stock size", "arbitrary size", "label", "heading" or "prose-sm".
 */
export function typeViolations(src: string): string[] {
  const out: string[] = []
  const stock = src.match(new RegExp(STOCK_SIZE.source, "g"))
  if (stock) out.push(`stock size: ${[...new Set(stock)].join(", ")}`)
  const arb = src.match(new RegExp(ARBITRARY_SIZE.source, "g"))
  if (arb) out.push(`arbitrary size: ${[...new Set(arb)].join(", ")}`)
  for (const s of labelViolations(src)) {
    out.push(`label: text-label without uppercase or tracking in "${s}"`)
  }
  for (const tag of headingOpenTags(src)) {
    if (HEADING_BAD.test(tag)) {
      out.push(`heading: weight or tracking on ${tag.replace(/\s+/g, " ").slice(0, 80)}`)
    }
  }
  if (/\bprose-sm\b/.test(src)) out.push("prose-sm: not allowed")
  return out
}

const WARM_COLOUR =
  /\b(?:bg|text|border|from|via|to|ring|fill|stroke|outline|decoration|divide|placeholder|shadow)-(?:amber|yellow|orange)-\d+/g

export const ALLOW_DECORATIVE = "type-guard: allow decorative"

/**
 * A file carrying this marker sets document colours (the user's own CV palette and its exports), which are
 * deliberately fixed values, not app theme colours; literal colour values are allowed in it.
 */
export const ALLOW_DOCUMENT_COLOURS = "type-guard: document colours"

/** A literal colour value: a quoted, styled or bracketed hex code, or rgb/hsl/oklch/oklab written with numbers. */
const LITERAL_COLOUR =
  /(?:['"`(:,\s[]#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?=['"`,;)\s_\]]))|(?:\b(?:rgba?|hsla?|oklch|oklab)\(\s*[0-9.])/g

/**
 * Hard-coded colours anywhere in the source (class strings, styles, helper constants, maps); theme tokens
 * should be used instead. Two kinds: stock amber, yellow or orange tokens, and literal colour values (hex,
 * rgb, hsl, oklch). A line carrying "type-guard: allow decorative" is skipped; a file carrying
 * "type-guard: document colours" may use literal values (it sets the CV's own colours).
 */
export function colourViolations(src: string): string[] {
  const out: string[] = []
  const documentColours = src.includes(ALLOW_DOCUMENT_COLOURS)
  for (const line of src.split(/\r?\n/)) {
    if (line.includes(ALLOW_DECORATIVE)) continue
    const hits = line.match(WARM_COLOUR)
    if (hits) out.push(`warm colour: ${[...new Set(hits)].join(", ")}`)
    if (documentColours) continue
    if (LITERAL_COLOUR.test(line)) out.push(`literal colour (use a theme token): ${line.trim().slice(0, 80)}`)
    LITERAL_COLOUR.lastIndex = 0
  }
  return out
}
