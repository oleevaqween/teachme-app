import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8")

/** Declaration text of the rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const lines = css.split("\n")
  const start = lines.findIndex((l) => l.trim() === `${selector} {`)
  if (start < 0) throw new Error(`rule not found: ${selector}`)
  const end = lines.findIndex((l, i) => i > start && l.trim() === "}")
  return lines.slice(start + 1, end).join("\n")
}

function decl(selector: string, prop: string): string | undefined {
  const pattern = new RegExp(String.raw`(?:^|\s)${prop}:\s*([^;]+);`)
  const m = rule(selector).match(pattern)
  return m?.[1].trim()
}

function sized(selector: string, name: string) {
  expect(decl(selector, "font-size")).toBe(`var(--text-${name})`)
  expect(decl(selector, "line-height")).toBe(`var(--text-${name}--line-height)`)
}

describe("Teach Me reading styles", () => {
  it("sets reading headings to weight 500", () => {
    expect(decl(".prose.reading :where(h1, h2, h3)", "font-weight")).toBe("500")
  })

  it("sizes lessons from the type scale", () => {
    sized(".prose.reading-lesson", "lead")
    sized(".prose.reading-lesson :where(h1)", "h1")
    sized(".prose.reading-lesson :where(h2)", "h2")
    sized(".prose.reading-lesson :where(h3)", "h3")
    expect(decl(".prose.reading-lesson :where(h4)", "font-size")).toBe(
      "var(--text-lead)"
    )
    expect(decl(".prose.reading-lesson :where(h4)", "line-height")).toBe(
      "var(--text-h3--line-height)"
    )
  })

  it("sizes replies from the type scale", () => {
    sized(".prose.reading-reply", "lead")
    sized(".prose.reading-reply :where(h1, h2)", "h3")
    expect(decl(".prose.reading-reply :where(h3)", "font-size")).toBe(
      "var(--text-lead)"
    )
    expect(decl(".prose.reading-reply :where(h3)", "line-height")).toBe(
      "var(--text-h3--line-height)"
    )
    expect(decl(".prose.reading-reply :where(h4)", "line-height")).toBe(
      "var(--text-h3--line-height)"
    )
    expect(decl(".prose.reading-reply :where(h4)", "font-size")).toBe(
      "var(--text-lead)"
    )
  })

  it("uses no raw rem or px font sizes except 0.875em on code and tables", () => {
    const re = /^(\.prose\.reading[^{]*)\{([^}]*)\}/gm
    let m: RegExpExecArray | null
    let seen = 0
    while ((m = re.exec(css))) {
      seen++
      const size = m[2].match(/font-size:\s*([^;]+);/)?.[1].trim()
      if (!size) continue
      if (size === "0.875em") continue
      expect(size, m[1].trim()).not.toMatch(/\d(rem|px)$/)
    }
    expect(seen).toBeGreaterThan(10)
  })

  it("keeps the reading block unlayered", () => {
    const at = css.indexOf(".prose.reading {")
    let depth = 0
    for (const c of css.slice(0, at)) {
      if (c === "{") depth++
      else if (c === "}") depth--
    }
    expect(depth).toBe(0)
  })
})
