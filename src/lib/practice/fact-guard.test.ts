import { describe, expect, it } from 'vitest';
import { guardRewrite, numericFacts, REWRITE_WITHHELD } from './fact-guard';

describe('numericFacts', () => {
  it('normalises currency, separators and trailing zero decimals', () => {
    expect(numericFacts('Saved ₦2,000,000 (12%) for 4 teams in 2023, about 45.0% faster')).toEqual(['2000000', '12%', '4', '2023', '45%']);
  });
  it('returns nothing for text without numbers', () => {
    expect(numericFacts('Led the rollout calmly')).toEqual([]);
  });
});

describe('numericFacts: scales, units and forms', () => {
  it('reads currency and magnitude forms of two million as one fact', () => {
    expect(numericFacts('₦2 million')).toEqual(['2000000']);
    expect(numericFacts('2m')).toEqual(['2000000']);
    expect(numericFacts('N2,000,000')).toEqual(['2000000']);
    expect(numericFacts('₦2m')).toEqual(['2000000']);
  });
  it('multiplies decimals and k suffixes', () => {
    expect(numericFacts('2.5m')).toEqual(['2500000']);
    expect(numericFacts('2k')).toEqual(['2000']);
  });
  it('canonicalises decimals', () => {
    expect(numericFacts('2.50')).toEqual(numericFacts('2.5'));
    expect(numericFacts('2.50')).toEqual(['2.5']);
  });
  it('reads ordinals', () => {
    expect(numericFacts('1st')).toEqual(['ord:1']);
  });
  it('reads ranges as two facts', () => {
    expect(numericFacts('10-15')).toEqual(['10', '15']);
    expect(numericFacts('10–15')).toEqual(['10', '15']);
  });
  it('only treats valid thousands groups as one number', () => {
    expect(numericFacts('1,2,3')).toEqual(['1', '2', '3']);
  });
  it('keeps time units in the fact', () => {
    expect(numericFacts('30 days')).toEqual(['30 day']);
    expect(numericFacts('30-day')).toEqual(['30 day']);
  });
  it('reads spelled-out numbers like digits', () => {
    expect(numericFacts('a dozen')).toEqual(['12']);
    expect(numericFacts('twenty-five')).toEqual(['25']);
    expect(numericFacts('twenty five')).toEqual(['25']);
    expect(numericFacts('five million')).toEqual(['5000000']);
    expect(numericFacts('two hundred')).toEqual(['200']);
    expect(numericFacts('thirty percent')).toEqual(['30%']);
    expect(numericFacts('30 per cent')).toEqual(['30%']);
  });
  it('reads multiplier words', () => {
    expect(numericFacts('doubled')).toEqual(['x2']);
    expect(numericFacts('tripling')).toEqual(['x3']);
    expect(numericFacts('halved')).toEqual(['x0.5']);
  });
  it('ignores one, first and second in strict mode but reads them in lenient mode', () => {
    expect(numericFacts('First, one lesson, second thoughts')).toEqual([]);
    expect(numericFacts('first one second', { lenient: true })).toEqual(['ord:1', '1', 'ord:2']);
  });
});

describe('guardRewrite', () => {
  it('withholds an invented currency figure but keeps an equivalent one', () => {
    expect(guardRewrite('I saved ₦2 million', ['We had 2 teams'])).toEqual({ rewrite: null, rewriteWithheld: REWRITE_WITHHELD });
    expect(guardRewrite('I saved ₦2 million', ['Saved ₦2,000,000'])).toEqual({ rewrite: 'I saved ₦2 million', rewriteWithheld: null });
  });
  it('does not accept a different time unit', () => {
    expect(guardRewrite('Done in 30 days', ['It took 30 hours'])).toEqual({ rewrite: null, rewriteWithheld: REWRITE_WITHHELD });
    expect(guardRewrite('Done in 30 days', ['a 30-day sprint']).rewriteWithheld).toBeNull();
  });
  it('accepts an ordinal written as a word in the source', () => {
    expect(guardRewrite('I came 1st', ['I was first']).rewriteWithheld).toBeNull();
  });
  it('withholds spelled-out figures that the sources lack', () => {
    expect(guardRewrite('I led a team of five', ['I led a team']).rewriteWithheld).toBe(REWRITE_WITHHELD);
    expect(guardRewrite('I led a team of five', ['I led 5 engineers']).rewriteWithheld).toBeNull();
    expect(guardRewrite('Up thirty percent', ['Up 30%']).rewriteWithheld).toBeNull();
    expect(guardRewrite('I doubled revenue', ['Revenue grew']).rewriteWithheld).toBe(REWRITE_WITHHELD);
    expect(guardRewrite('I doubled revenue', ['Revenue doubled']).rewriteWithheld).toBeNull();
    expect(guardRewrite('I doubled revenue', ['Revenue grew twice']).rewriteWithheld).toBeNull();
  });
  it('does not withhold for the words one, first or second alone', () => {
    const rewrite = 'First, I mapped the risks; one lesson was to ask early, and second, to document.';
    expect(guardRewrite(rewrite, ['I managed risks well'])).toEqual({ rewrite, rewriteWithheld: null });
  });
});

describe('guardRewrite basics', () => {
  const cv = 'Managed a budget of ₦2,000,000. Prepared monthly reports for 4 stakeholders.';

  it('keeps a rewrite whose numbers come from the answer or the CV', () => {
    const rewrite = 'I managed a ₦2000000 budget and reported to 4 stakeholders, cutting delays by 10%.';
    expect(guardRewrite(rewrite, ['We cut delays by 10%.', cv])).toEqual({ rewrite, rewriteWithheld: null });
  });

  it('withholds a rewrite that introduces a number found nowhere', () => {
    expect(guardRewrite('I saved 30% of the budget.', ['I saved money.', cv])).toEqual({ rewrite: null, rewriteWithheld: REWRITE_WITHHELD });
  });

  it('keeps a rewrite without numbers and passes null through', () => {
    expect(guardRewrite('I led the team through the change.', [cv])).toEqual({ rewrite: 'I led the team through the change.', rewriteWithheld: null });
    expect(guardRewrite(null, [cv])).toEqual({ rewrite: null, rewriteWithheld: null });
  });
});

describe('numericFacts: bypass closures', () => {
  it('scales spaced abbreviated magnitudes like attached ones', () => {
    expect(numericFacts('₦5 bn')).toEqual(['5000000000']);
    expect(numericFacts('2 mn')).toEqual(['2000000']);
    expect(numericFacts('3 k')).toEqual(['3000']);
    expect(numericFacts('5 m')).toEqual(['5000000']);
    expect(numericFacts('5 managers')).toEqual(['5']);
    expect(numericFacts('5 min')).toEqual(['5 minute']);
  });
  it('reads fold words and x multipliers', () => {
    expect(numericFacts('twofold')).toEqual(['x2']);
    expect(numericFacts('two-fold')).toEqual(['x2']);
    expect(numericFacts('threefold')).toEqual(['x3']);
    expect(numericFacts('tenfold')).toEqual(['x10']);
    expect(numericFacts('10-fold')).toEqual(['x10']);
    expect(numericFacts('10 fold')).toEqual(['x10']);
    expect(numericFacts('10x')).toEqual(['x10']);
    expect(numericFacts('10×')).toEqual(['x10']);
    expect(numericFacts('10 x')).toEqual(['x10']);
    expect(numericFacts('3x faster')).toEqual(['x3']);
  });
  it('reads plural magnitudes as phrase facts', () => {
    expect(numericFacts('thousands of users')).toEqual(['many:thousand']);
    expect(numericFacts('hundreds of thousands of users')).toEqual(['many:hundred', 'many:thousand']);
    expect(guardRewrite('Served thousands of users', ['Served many users']).rewriteWithheld).toBe(REWRITE_WITHHELD);
    expect(guardRewrite('Served thousands of users', ['Served thousands of users']).rewriteWithheld).toBeNull();
  });
  it('reads zero, quarter fractions and decades', () => {
    expect(numericFacts('zero downtime')).toEqual(['0']);
    expect(numericFacts('a quarter of the team')).toEqual(['x0.25']);
    expect(numericFacts('quarter of the budget')).toEqual(['x0.25']);
    expect(numericFacts('in the third quarter of the year')).toEqual(['ord:3']);
    expect(numericFacts('Q3 results')).toEqual(['3']);
    expect(numericFacts('a decade')).toEqual(['10 year']);
    expect(numericFacts('two decades')).toEqual(['20 year']);
    expect(numericFacts('decades of experience')).toEqual(['10 year']);
  });
  it('reads a percent sign after a space', () => {
    expect(numericFacts('30 %')).toEqual(['30%']);
  });
});

describe('numericFacts: false withhold closures', () => {
  it('gives the same time fact for plus, filler adjectives and abbreviations', () => {
    for (const text of ['5 years', '5+ years', '5+ yrs', 'over 5 years', '5 full years', '5 yr', "5 years'"]) {
      expect(numericFacts(text)).toEqual(['5 year']);
    }
    expect(numericFacts('10 working days')).toEqual(['10 day']);
    expect(numericFacts('3 mos')).toEqual(['3 month']);
    expect(numericFacts('2 wks')).toEqual(['2 week']);
    expect(numericFacts('4 hrs')).toEqual(['4 hour']);
    expect(numericFacts('15 mins')).toEqual(['15 minute']);
    expect(numericFacts('30 secs')).toEqual(['30 second']);
    expect(guardRewrite('Over 5 years of delivery', ['5+ yrs in delivery']).rewriteWithheld).toBeNull();
  });
  it('does not read double idioms as x2', () => {
    for (const text of ['double-check', 'doubled-checked', 'double-click', 'doubling down', 'double down']) {
      expect(numericFacts(text)).toEqual([]);
    }
    expect(numericFacts('doubled revenue')).toEqual(['x2']);
  });
  it('does not read hyphenated or fixed ordinal compounds as ordinals', () => {
    expect(numericFacts('third-party vendors')).toEqual([]);
    expect(numericFacts('third party vendors')).toEqual([]);
    expect(numericFacts('second-hand and first-hand', { lenient: true })).toEqual([]);
    expect(numericFacts('third place')).toEqual(['ord:3']);
  });
  it('lets a plain number in the sources satisfy a day-of-month ordinal', () => {
    expect(numericFacts('15', { lenient: true })).toEqual(['15', 'ord:15']);
    expect(numericFacts('15')).toEqual(['15']);
    expect(guardRewrite('Launched on 15th March', ['Launched 15 March']).rewriteWithheld).toBeNull();
    expect(guardRewrite('Launched on 15th March', ['Launched in March']).rewriteWithheld).toBe(REWRITE_WITHHELD);
  });
  it('reads "a year" in the sources only, while "1 year" is always checked', () => {
    expect(numericFacts('a year, an hour')).toEqual([]);
    expect(numericFacts('a year, an hour, one day', { lenient: true })).toEqual(['1 year', '1 hour', '1 day']);
    expect(guardRewrite('Over 1 year', ['Spent a year there']).rewriteWithheld).toBeNull();
    expect(guardRewrite('Over 1 year', ['Spent time there']).rewriteWithheld).toBe(REWRITE_WITHHELD);
    expect(guardRewrite('Over a year', ['Spent time there']).rewriteWithheld).toBeNull();
  });
  it('does not read unhyphenated double idioms as x2', () => {
    for (const text of ['double checked', 'double checking', 'double check', 'double clicked', 'double clicking', 'double click', 'double or nothing']) {
      expect(numericFacts(text)).toEqual([]);
    }
    expect(numericFacts('double the output')).toEqual(['x2']);
  });
  it('does not read B2B style abbreviations as a magnitude', () => {
    expect(numericFacts('B2B SaaS')).toEqual(['2']);
    expect(numericFacts('B2B SaaS')).not.toContain('2000000000');
    expect(numericFacts('B2C and P2P')).toEqual(['2']);
    expect(numericFacts('N2m')).toEqual(['2000000']);
  });
  it('reads "N times" like "Nx"', () => {
    expect(numericFacts('3 times faster')).toEqual(['x3']);
    expect(numericFacts('two times')).toEqual(['x2']);
    expect(numericFacts('3 time')).toEqual(['3']);
    expect(numericFacts('at times')).toEqual([]);
    expect(guardRewrite('Made it 3x faster', ['It got 3 times faster']).rewriteWithheld).toBeNull();
    expect(guardRewrite('Made it 3 times faster', ['It got 3x faster']).rewriteWithheld).toBeNull();
    expect(guardRewrite('Made it 3 times faster', ['It got faster']).rewriteWithheld).toBe(REWRITE_WITHHELD);
  });
});
