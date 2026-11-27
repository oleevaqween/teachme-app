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
})
