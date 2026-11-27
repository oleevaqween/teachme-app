// Property test for CV factual data preservation
// Task 11.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 18: CV Factual Data Preservation
 *
 * For any CV document containing dates, job titles, company names, education
 * credentials, and quantitative achievements, the refined output SHALL contain
 * all of these factual elements exactly as they appeared in the original.
 *
 * Since the actual refinement calls an LLM, we test the concept as a pure function:
 * - Generate random CVs with known factual elements
 * - Simulate a transformation (refinement)
 * - Verify the checkFactualPreservation function correctly detects preservation/loss
 *
 * **Validates: Requirements 8.4**
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface FactualElement {
  type: 'date' | 'title' | 'company' | 'credential' | 'number';
  value: string;
}

interface CVData {
  rawText: string;
  facts: FactualElement[];
}

// ─── checkFactualPreservation ───────────────────────────────────────────────

/**
 * Checks whether all factual elements from the original CV are preserved
 * in the refined output. Returns true if ALL facts are present.
 */
export function checkFactualPreservation(
  originalFacts: FactualElement[],
  refinedText: string
): { preserved: boolean; missingFacts: FactualElement[] } {
  const missingFacts: FactualElement[] = [];

  for (const fact of originalFacts) {
    if (!refinedText.includes(fact.value)) {
      missingFacts.push(fact);
    }
  }

  return {
    preserved: missingFacts.length === 0,
    missingFacts,
  };
}

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate realistic date strings */
const dateArb = fc.oneof(
  // "2019-2022" style
  fc.tuple(fc.integer({ min: 1990, max: 2024 }), fc.integer({ min: 1, max: 4 })).map(
    ([year, span]) => `${year}-${year + span}`
  ),
  // "Jan 2020" style
  fc.tuple(
    fc.constantFrom('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'),
    fc.integer({ min: 2000, max: 2024 })
  ).map(([month, year]) => `${month} ${year}`),
  // "2021" standalone year
  fc.integer({ min: 1990, max: 2024 }).map((y) => `${y}`)
);

/** Generate job title strings */
const titleArb = fc.constantFrom(
  'Senior Software Engineer',
  'Product Manager',
  'Data Scientist',
  'DevOps Engineer',
  'Frontend Developer',
  'Machine Learning Engineer',
  'Engineering Manager',
  'Solutions Architect',
  'QA Lead',
  'CTO'
);

/** Generate company name strings */
const companyArb = fc.constantFrom(
  'Google LLC',
  'Microsoft Corporation',
  'Amazon Web Services',
  'Meta Platforms',
  'Apple Inc.',
  'Netflix',
  'Stripe Inc.',
  'Shopify',
  'Datadog',
  'Cloudflare'
);

/** Generate credential strings */
const credentialArb = fc.constantFrom(
  'B.S. Computer Science',
  'M.S. Data Science',
  'Ph.D. Mathematics',
  'AWS Solutions Architect',
  'PMP Certified',
  'Certified Kubernetes Administrator',
  'Google Cloud Professional',
  'MBA',
  'Certified Scrum Master',
  'CISSP'
);

/** Generate quantitative achievement strings */
const numberArb = fc.oneof(
  fc.integer({ min: 1, max: 99 }).map((n) => `${n}%`),
  fc.integer({ min: 100, max: 9999 }).map((n) => `$${n}`),
  fc.integer({ min: 2, max: 500 }).map((n) => `${n} team members`),
  fc.integer({ min: 10, max: 1000 }).map((n) => `${n}ms`),
  fc.integer({ min: 1, max: 100 }).map((n) => `${n}x improvement`)
);

/** Generate a CV with known factual elements */
const cvDataArb = fc.tuple(
  fc.array(dateArb, { minLength: 1, maxLength: 3 }),
  fc.array(titleArb, { minLength: 1, maxLength: 3 }),
  fc.array(companyArb, { minLength: 1, maxLength: 3 }),
  fc.array(credentialArb, { minLength: 1, maxLength: 2 }),
  fc.array(numberArb, { minLength: 1, maxLength: 3 })
).map(([dates, titles, companies, credentials, numbers]): CVData => {
  // Ensure all fact values appear in the raw text by aligning
  // arrays to the max length and building lines that include each element.
  const maxLen = Math.max(dates.length, titles.length, companies.length);

  const experienceLines: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const title = titles[i % titles.length];
    const company = companies[i % companies.length];
    const date = dates[i % dates.length];
    experienceLines.push(`${title} at ${company} (${date})`);
  }

  // Build facts from unique values that we know appear in the text
  const factsMap = new Map<string, FactualElement>();

  for (const d of dates) {
    factsMap.set(d, { type: 'date' as const, value: d });
  }
  for (const t of titles) {
    factsMap.set(t, { type: 'title' as const, value: t });
  }
  for (const c of companies) {
    factsMap.set(c, { type: 'company' as const, value: c });
  }
  for (const c of credentials) {
    factsMap.set(c, { type: 'credential' as const, value: c });
  }
  for (const n of numbers) {
    factsMap.set(n, { type: 'number' as const, value: n });
  }

  const facts = Array.from(factsMap.values());

  // Build raw text that contains ALL facts explicitly
  const rawText = [
    'Professional Summary',
    `Experienced ${titles[0]} with proven track record.`,
    '',
    'Experience',
    ...experienceLines,
    ...numbers.map((n) => `Achieved ${n} in key project metrics.`),
    '',
    'Education',
    ...credentials.map((c) => c),
    '',
    // Include all dates explicitly to ensure they all appear
    ...dates.map((d) => `Period: ${d}`),
    // Include all companies explicitly
    ...companies.map((c) => `Company: ${c}`),
  ].join('\n');

  return { rawText, facts };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Property 18: CV Factual Data Preservation', () => {
  it('checkFactualPreservation returns true when all facts are present in refined text', () => {
    fc.assert(
      fc.property(cvDataArb, (cvData) => {
        // Simulate a "good" refinement that preserves all facts
        // (rephrases surrounding text but keeps factual elements)
        const refinedText = `Refined Professional Profile\n\n${cvData.rawText}\n\nAdditional polish applied.`;

        const result = checkFactualPreservation(cvData.facts, refinedText);

        expect(result.preserved).toBe(true);
        expect(result.missingFacts).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it('checkFactualPreservation detects missing facts when refinement drops data', () => {
    fc.assert(
      fc.property(
        cvDataArb,
        fc.integer({ min: 0 }),
        (cvData, seed) => {
          // Ensure we have at least one fact
          if (cvData.facts.length === 0) return;

          // Pick a fact to remove - ensure we pick one with a unique value
          // so that replacing ALL occurrences guarantees detection
          const targetIdx = seed % cvData.facts.length;
          const targetFact = cvData.facts[targetIdx];

          // Replace ALL occurrences of the target fact value with [REDACTED]
          const refinedText = cvData.rawText.split(targetFact.value).join('[REDACTED]');

          // Only assert if the replacement actually changed the text
          // (the fact was actually in rawText)
          if (refinedText === cvData.rawText) return;

          const result = checkFactualPreservation(cvData.facts, refinedText);

          // Should detect at least one missing fact
          expect(result.preserved).toBe(false);
          expect(result.missingFacts.length).toBeGreaterThanOrEqual(1);
          // The specific target fact should be in the missing list
          expect(result.missingFacts.some((f) => f.value === targetFact.value)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('checkFactualPreservation correctly handles all fact types', () => {
    fc.assert(
      fc.property(
        dateArb,
        titleArb,
        companyArb,
        credentialArb,
        numberArb,
        (date, title, company, credential, number) => {
          const facts: FactualElement[] = [
            { type: 'date', value: date },
            { type: 'title', value: title },
            { type: 'company', value: company },
            { type: 'credential', value: credential },
            { type: 'number', value: number },
          ];

          // Text with all facts present
          const completeText = `${title} at ${company} during ${date}. Holds ${credential}. Achieved ${number}.`;
          const completeResult = checkFactualPreservation(facts, completeText);
          expect(completeResult.preserved).toBe(true);

          // Text missing the company name
          const incompleteText = `${title} at [COMPANY] during ${date}. Holds ${credential}. Achieved ${number}.`;
          const incompleteResult = checkFactualPreservation(facts, incompleteText);
          expect(incompleteResult.preserved).toBe(false);
          expect(incompleteResult.missingFacts).toContainEqual({ type: 'company', value: company });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty facts list always reports preservation as true', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (text) => {
        const result = checkFactualPreservation([], text);
        expect(result.preserved).toBe(true);
        expect(result.missingFacts).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});
