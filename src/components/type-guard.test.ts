import { describe, expect, it } from "vitest"
import { colourViolations, typeViolations } from "@/components/type-guard"

describe("typeViolations", () => {
  it("passes clean source", () => {
    expect(
      typeViolations(`<h2 className="text-h2">It's</h2><p className="text-body">x</p>`)
    ).toEqual([])
  })
  it("catches each rule", () => {
    expect(typeViolations(`<p className="text-sm">`)).toHaveLength(1)
    expect(typeViolations(`<p className="text-[.8rem]">`)).toHaveLength(1)
    expect(typeViolations(`<p className="text-[12pt]">`)).toHaveLength(1)
    expect(typeViolations(`<p className="text-label">`)).toHaveLength(1)
    expect(typeViolations(`<h3 className="font-semibold">`)).toHaveLength(1)
    expect(typeViolations(`<div className="prose-sm">`)).toHaveLength(1)
  })
})

describe("colourViolations", () => {
  it("catches warm colours in helper constants and class strings", () => {
    expect(colourViolations(`const TONE = { warn: "text-amber-600" }`)).toHaveLength(1)
    expect(colourViolations(`<p className="hover:bg-orange-100">`)).toHaveLength(1)
  })
  it("allows the decorative marker on the same line", () => {
    expect(
      colourViolations(`<Trophy className="text-yellow-500" /> {/* type-guard: allow decorative */}`)
    ).toEqual([])
    expect(colourViolations(`<Trophy className="text-yellow-500" />`)).toHaveLength(1)
  })
  it("ignores theme tokens", () => {
    expect(colourViolations(`<p className="text-primary bg-accent">`)).toEqual([])
  })
  it("catches literal colour values in arbitrary classes, styles and strings", () => {
    expect(colourViolations(`<div className="bg-[radial-gradient(circle,rgba(180,130,50,0.04)_1px,transparent_0)]" />`)).toHaveLength(1)
    expect(colourViolations(`<div className="text-[#c2410c]" />`)).toHaveLength(1)
    expect(colourViolations(`<p style={{ color: '#fff' }} />`)).toHaveLength(1)
    expect(colourViolations(`const shade = "hsl(30 80% 40%)"`)).toHaveLength(1)
    expect(colourViolations(`const ink = "oklch(0.5 0.1 70)"`)).toHaveLength(1)
  })
  it("allows colours built from theme variables, and ordinary # text", () => {
    expect(colourViolations(`<i className="to-[color-mix(in_oklch,var(--primary),var(--foreground)_30%)]" />`)).toEqual([])
    expect(colourViolations(`<a href="#main">Skip</a> <p>Step #3 of 5</p>`)).toEqual([])
  })
  it("allows a file marked as setting document colours (the user's CV), and only such a file", () => {
    const cv = `// type-guard: document colours (the CV's own accent palette)
export const navy = '#213e64'`
    expect(colourViolations(cv)).toEqual([])
    expect(colourViolations(`export const navy = '#213e64'`)).toHaveLength(1)
  })
})
