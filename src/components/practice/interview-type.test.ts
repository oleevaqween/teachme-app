import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { colourViolations, typeViolations } from "@/components/type-guard"

const ROOTS = [
  "src/app/interview",
  "src/components/interview",
  "src/components/practice",
]

/** Every non-test .tsx file in the Interview area, hardcoded on purpose. */
export const INTERVIEW_FILES: string[] = [
  "src/app/interview/archive/page.tsx",
  "src/app/interview/mock/page.tsx",
  "src/app/interview/page.tsx",
  "src/app/interview/practice/[id]/page.tsx",
  "src/components/interview/ArchiveList.tsx",
  "src/components/interview/QuestionCard.tsx",
  "src/components/practice/AnswerBox.tsx",
  "src/components/practice/ApplicationPracticeList.tsx",
  "src/components/practice/AttemptHistory.tsx",
  "src/components/practice/FeedbackCard.tsx",
  "src/components/practice/PracticeSession.tsx",
  "src/components/practice/QuestionList.tsx",
  "src/components/practice/SaveEvidenceBox.tsx",
]

/**
 * Files not yet converted to the shared type scale. Each conversion task
 * deletes its own lines; the last one adds a size-zero check.
 */
export const PENDING = new Set<string>([
])

const cwd = process.cwd()

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

describe("Interview type scale guard", () => {
  it("lists every Interview file", () => {
    const found = ROOTS.flatMap((r) => walk(path.join(cwd, r)))
      .map((f) => path.relative(cwd, f).split(path.sep).join("/"))
      .sort()
    expect(INTERVIEW_FILES.slice().sort()).toEqual(found)
  })

  it("has no pending files left", () => {
    expect(PENDING.size).toBe(0)
  })

  for (const file of INTERVIEW_FILES) {
    it.skipIf(PENDING.has(file))(`${file} follows the type scale`, () => {
      expect(
        typeViolations(readFileSync(path.join(cwd, file), "utf8"))
      ).toEqual([])
    })
  }

  for (const file of INTERVIEW_FILES) {
    it(`${file} uses theme colours, not amber`, () => {
      expect(
        colourViolations(readFileSync(path.join(cwd, file), "utf8"))
      ).toEqual([])
    })
  }
})
