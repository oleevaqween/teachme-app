import { describe, expect, it } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("keeps a shared text size next to a text colour", () => {
    expect(cn("text-body text-muted-foreground")).toBe(
      "text-body text-muted-foreground"
    )
  })

  it("keeps a text colour followed by a shared text size", () => {
    expect(cn("text-muted-foreground", "text-lead")).toBe(
      "text-muted-foreground text-lead"
    )
  })

  it("lets a later shared size win over an earlier stock size", () => {
    expect(cn("text-sm text-body")).toBe("text-body")
  })

  it("still merges normal utilities", () => {
    expect(cn("px-2 px-4")).toBe("px-4")
  })

  const SCALE = ["label", "caption", "small", "body", "lead", "h3", "h2", "h1", "display"]

  it("treats every scale name as a size, never as a colour", () => {
    for (const name of SCALE) {
      expect(cn(`text-${name}`, "text-primary")).toBe(`text-${name} text-primary`)
      expect(cn(`text-${name} text-primary`)).toBe(`text-${name} text-primary`)
      expect(cn("text-sm", `text-${name}`)).toBe(`text-${name}`)
    }
  })

  it("keeps both caller classes when merged over the Button base text-sm", () => {
    expect(cn("text-sm font-medium", "text-lead text-primary-foreground")).toBe(
      "font-medium text-lead text-primary-foreground"
    )
  })
})
