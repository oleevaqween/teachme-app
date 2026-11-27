import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  extractClassStrings,
  labelViolations,
  typeViolations,
} from "@/components/type-guard"

const ROOTS = ["src/app/teach-me", "src/components/journey"]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx"))
      out.push(full)
  }
  return out
}

const cwd = process.cwd()

/** Used only by the Teach Me start page, so it follows the same rules. */
const EXTRA_FILES = ["src/components/documents/FileUploader.tsx"]

/** Every non-test .tsx file, as a repo-relative forward-slash path. */
export const TEACH_ME_FILES: string[] = ROOTS.flatMap((root) =>
  walk(path.join(cwd, root))
)
  .map((f) => path.relative(cwd, f).split(path.sep).join("/"))
  .concat(EXTRA_FILES)
  .sort()

/**
 * Files not yet converted to the shared type scale. Hardcoded on purpose: a new
 * file is guarded by default, and each conversion task deletes its own lines.
 */
export const PENDING = new Set<string>([])

describe("class string extraction", () => {
  const snippet = [
    "export function X() {",
    "  return (",
    "    <div>",
    "      <p className=\"text-label uppercase\">Don't panic, it's fine</p>",
    "      <span",
    "        className={cn(",
    '          "text-label",',
    "          active && 'text-foreground',",
    "          big ? `tracking-wide` : null",
    "        )}",
    "      >",
    "        It's the learner's turn",
    "      </span>",
    "      <i className={cn('text-label font-medium')}>Don't</i>",
    "    </div>",
    "  )",
    "}",
  ].join("\n")

  it("ignores apostrophes in JSX text and reads multi-line cn() arguments", () => {
    expect(extractClassStrings(snippet)).toEqual([
      "text-label uppercase",
      "text-label",
      "text-foreground",
      "tracking-wide",
      "text-label font-medium",
    ])
  })

  it("flags only the class strings that break the label rule", () => {
    // "text-label" alone (its tracking is in a sibling string) and the last one fail.
    expect(labelViolations(snippet)).toEqual([
      "text-label",
      "text-label font-medium",
    ])
  })

  it("passes a clean label even with stray apostrophes around it", () => {
    const ok = `<p className="text-label tracking-wider">Don't</p><b>it's</b>`
    expect(labelViolations(ok)).toEqual([])
  })
})

describe("Teach Me type scale guard", () => {
  it("has no pending files", () => {
    expect(PENDING.size).toBe(0)
  })

  it("finds the Teach Me files", () => {
    expect(TEACH_ME_FILES.length).toBeGreaterThanOrEqual(14)
  })

  for (const file of TEACH_ME_FILES) {
    describe(file, () => {
      const src = () => readFileSync(path.join(cwd, file), "utf8")

      const only = (rule: string) => () =>
        expect(
          typeViolations(src()).filter((v) => v.startsWith(rule))
        ).toEqual([])

      it.skipIf(PENDING.has(file))(
        "uses no stock or arbitrary text sizes",
        () => {
          const v = typeViolations(src()).filter(
            (x) => x.startsWith("stock size") || x.startsWith("arbitrary size")
          )
          expect(v).toEqual([])
        }
      )

      it.skipIf(PENDING.has(file))(
        "pairs text-label with uppercase or tracking",
        only("label")
      )

      it.skipIf(PENDING.has(file))(
        "leaves heading weight and tracking to the base rule",
        only("heading")
      )

      it.skipIf(PENDING.has(file))("does not use prose-sm", only("prose-sm"))
    })
  }
})
