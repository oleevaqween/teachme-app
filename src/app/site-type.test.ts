import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { colourViolations, typeViolations } from "@/components/type-guard"

const cwd = process.cwd()

/** Files that still use stock sizes or hard-coded warm colours; each stage removes its lines. */
const PENDING = new Set<string>([
])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(tsx|ts|js)$/.test(entry.name) && !/\.test\.[tj]sx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const FILES = walk(path.join(cwd, "src"))
  .map((f) => path.relative(cwd, f).split(path.sep).join("/"))
  .filter((f) => f !== "src/components/type-guard.ts")
  .sort()

describe("site-wide type and colour guard", () => {
  it("finds the source files", () => {
    expect(FILES.length).toBeGreaterThan(50)
  })

  it("has no pending files left", () => {
    expect(PENDING.size).toBe(0)
  })

  it("lists only files that exist in PENDING", () => {
    for (const file of PENDING) expect(existsSync(path.join(cwd, file)), file).toBe(true)
  })

  for (const file of FILES) {
    it.skipIf(PENDING.has(file))(`${file} follows the type scale and theme colours`, () => {
      const src = readFileSync(path.join(cwd, file), "utf8")
      expect([...typeViolations(src), ...colourViolations(src)]).toEqual([])
    })
  }
})

function read(file: string): string {
  return readFileSync(path.join(cwd, file), "utf8")
}

describe("contrast regressions", () => {
  it("gives every soft gold button a readable hover text colour", () => {
    for (const file of FILES) {
      for (const line of read(file).split(/\r?\n/)) {
        if (!line.includes("hover:bg-primary/15")) continue
        expect(
          line.includes("hover:text-accent-foreground") || line.includes("hover:text-foreground"),
          `${file}: ${line.trim().slice(0, 60)}`,
        ).toBe(true)
      }
    }
  })

  it("keeps the pptx badge tint at 10 percent", () => {
    expect(read("src/components/documents/FileList.tsx")).toContain('"bg-primary/10 text-primary"')
  })

  it("keeps the global error id at gray-500", () => {
    expect(read("src/app/global-error.tsx")).not.toContain("text-gray-400")
  })

  it("keeps the default button hover at 90 percent", () => {
    const src = read("src/components/ui/button.tsx")
    expect(src).toContain("hover:bg-primary/90")
    expect(src).not.toContain("hover:bg-primary/80")
  })

  it("keeps application status chips on one line", () => {
    expect(read("src/components/applications/ApplicationsTable.tsx")).toMatch(
      /whitespace-nowrap rounded-full[^`]*statusTone/,
    )
  })
})
