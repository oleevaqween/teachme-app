import { describe, expect, it } from 'vitest';
import { editFlags, ownershipFlags, seniorityFlags } from './edit-safety';
import { ownershipFlags as improveOwnershipFlags } from './improve-rules';
import type { Suggestion } from './schema';

/** A tailoring suggestion; with no quotes given, its only evidence is the original line (as tailoring usually cites). */
const suggestion = (before: string, after: string, quotes: string[] = [before]): Suggestion => ({
  id: 's1', target: 'summary', before, after, reason: 'Match the posting.', status: 'pending',
  evidence: quotes.map(quote => ({ source: 'experience.e1', quote })),
});
const ownership = (was: string, now: string) => `Claims more ownership: the original says "${was}", the suggestion says "${now}". Check this is accurate.`;
const dropped = (q: string) => `Drops "${q}" from the original. Keep it if it is true.`;
const raised = (was: string, now: string) => `Raises seniority: the original says "${was}", the suggestion says "${now}". Check this is accurate.`;

describe('editFlags on realistic tailoring lines', () => {
  const cases: { name: string; before: string; after: string; quotes?: string[]; flags: string[] }[] = [
    { name: 'supported to led fires', before: 'Supported the finance team with month-end close.', after: 'Led the finance team through month-end close.', flags: [ownership('Supported', 'Led')] },
    { name: 'a stronger word already in the original does not fire', before: 'Led weekly stand-ups and supported sprint reviews.', after: 'Spearheaded weekly stand-ups and sprint reviews.', flags: [] },
    { name: 'a stronger word supported by an evidence quote does not fire', before: 'Finance analyst supporting month-end reporting.', after: 'Finance analyst who managed month-end reporting for 3 entities.', quotes: ['Managed month-end reporting for 3 entities.'], flags: [] },
    { name: 'a weaker word only in the evidence still fires', before: 'Finance analyst for month-end reporting.', after: 'Finance analyst who led month-end reporting.', quotes: ['Assisted with month-end reporting.'], flags: [ownership('Assisted', 'led')] },
    { name: 'co-led to led fires and drops "co-"', before: 'Co-led the migration to Sage.', after: 'Led the migration to Sage.', flags: [ownership('Co-led', 'Led'), dropped('co-')] },
    { name: 'co-founded to founded drops "co-"', before: 'Co-founded the campus finance society.', after: 'Founded the campus finance society.', flags: [dropped('co-')] },
    { name: 'Co-ordinated to Coordinated does not fire', before: 'Co-ordinated weekly supplier meetings.', after: 'Coordinated weekly supplier meetings to cut delivery delays.', flags: [] },
    { name: 'co-operate rewritten does not fire', before: 'Co-operated with procurement on vendor onboarding.', after: 'Worked with procurement to onboard 12 vendors.', quotes: ['Onboarded 12 vendors with procurement.'], flags: [] },
    { name: '"up to date" is not the qualifier "up to"', before: 'Kept customer records up to date in Salesforce.', after: 'Maintained accurate customer records in Salesforce.', flags: [] },
    { name: '"up-to-date" is not the qualifier "up to"', before: 'Kept an up-to-date fixed asset register.', after: 'Maintained the fixed asset register.', flags: [] },
    { name: '"up to" as a qualifier still fires', before: 'Handled up to 60 calls a day.', after: 'Handled 60 calls a day.', flags: [dropped('up to')] },
    { name: 'a qualifier kept does not fire', before: 'Processed about 200 invoices a week.', after: 'Processed about 200 supplier invoices a week in SAP.', flags: [] },
    { name: 'a dropped qualifier fires', before: 'Processed about 200 invoices a week.', after: 'Processed 200 invoices a week.', flags: [dropped('about')] },
    { name: 'a qualifier only in the evidence does not fire', before: 'Reconciled supplier accounts.', after: 'Reconciled 40 supplier accounts each month.', quotes: ['Reconciled roughly 40 supplier accounts each month.'], flags: [] },
    { name: 'Graduate Trainee to Graduate Analyst does not raise seniority', before: 'Graduate Trainee', after: 'Graduate Analyst', flags: [] },
    { name: 'Assistant Manager kept as it is does not fire', before: 'Assistant Manager with 4 years in retail operations.', after: 'Assistant Manager with 4 years in retail operations and stock control.', flags: [] },
    { name: 'Junior Analyst to Senior Analyst fires', before: 'Junior Analyst', after: 'Senior Analyst', flags: [raised('Junior', 'Senior')] },
    { name: 'intern to lead fires ownership and seniority', before: 'Audit intern who supported the year-end team.', after: 'Audit lead for the year-end team.', flags: [ownership('supported', 'lead'), raised('intern', 'lead')] },
    { name: 'a senior title already in the original does not fire', before: 'Finance graduate trainee who supported the Head of Finance.', after: 'Finance graduate trainee who supported the Head of Finance with weekly cash reports.', flags: [] },
    { name: 'a senior title in the evidence does not fire', before: 'Assistant accountant preparing VAT returns.', after: 'Assistant accountant preparing VAT returns for the Finance Director.', quotes: ['Prepared VAT returns for the Finance Director to sign.'], flags: [] },
    { name: 'a senior title for someone else fires (the rule cannot tell whose title it is)', before: 'Assistant accountant preparing VAT returns.', after: 'Assistant accountant preparing VAT returns for the finance director.', flags: [raised('Assistant', 'director')] },
    { name: 'Associate member to Senior member does not fire', before: 'Associate member of ICAN with 5 years in audit.', after: 'Senior member of ICAN with 5 years in audit.', flags: [] },
    { name: 'Associate member with another junior word fires on that word', before: 'Graduate accountant and associate member of ICAN.', after: 'Senior accountant and member of ICAN.', flags: [raised('Graduate', 'Senior')] },
    { name: '"lead generation" in a suggestion does not fire', before: 'Graduate marketing trainee.', after: 'Graduate marketing trainee running lead generation campaigns.', quotes: ['Ran email campaigns for 3 clients.'], flags: [] },
    { name: '"head office" in a suggestion does not fire', before: 'Graduate trainee in the finance team.', after: 'Graduate trainee in the head office finance team.', flags: [] },
    { name: 'no junior word means no seniority check', before: 'Internal audit officer.', after: 'Internal audit lead.', flags: [] },
    { name: 'a plain rewording does not fire', before: 'Managed a budget of ₦2,000,000.', after: 'Managed a ₦2,000,000 budget across 3 projects.', quotes: ['Managed a budget of ₦2,000,000 across 3 projects.'], flags: [] },
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(editFlags(suggestion(c.before, c.after, c.quotes))).toEqual(c.flags);
    });
  }
  it('an evidence quote backs an ownership change only with the same strong word', () => {
    const before = 'Supported the team', after = 'Led the team';
    expect(editFlags(suggestion(before, after, ['Led the project and supported the team']))).toEqual([]);
    expect(editFlags(suggestion(before, after, ['Managed the budget; supported the team']))).toEqual([ownership('Supported', 'Led')]);
    expect(editFlags(suggestion(before, after, ['Supported the team']))).toEqual([ownership('Supported', 'Led')]);
    expect(editFlags(suggestion('Assisted with audits', 'Managed audits', ['I managed the quarterly audits']))).toEqual([]);
  });
  it('joins every evidence quote as the sources', () => {
    const before = 'Reconciled accounts.', after = 'Led supplier reconciliations.';
    expect(editFlags(suggestion(before, after, [before, 'Assisted with supplier reconciliations.']))).toEqual([ownership('Assisted', 'Led')]);
    expect(editFlags(suggestion(before, after, ['Assisted with supplier reconciliations.', 'Led the reconciliation project.']))).toEqual([]);
  });
});

describe('seniorityFlags', () => {
  it('matches whole words in any case', () => {
    expect(seniorityFlags('JUNIOR analyst', '', 'SENIOR analyst')).toEqual([raised('JUNIOR', 'SENIOR')]);
    expect(seniorityFlags('Internship in audit', '', 'Senior auditor')).toEqual([]);
    expect(seniorityFlags('Graduate analyst', '', 'Graduate analyst tracking headcount')).toEqual([]);
    expect(seniorityFlags('Trainee consultant', '', 'Principal consultant')).toEqual([raised('Trainee', 'Principal')]);
  });
  it('does not treat "associate" as a junior word', () => {
    expect(seniorityFlags('Associate consultant', '', 'Principal consultant')).toEqual([]);
  });
  it('does not count "lead generation", "head office" or "headquarters" as senior words', () => {
    expect(seniorityFlags('Marketing intern', '', 'Marketing intern for lead generation and lead-generation reporting')).toEqual([]);
    expect(seniorityFlags('Graduate trainee', '', 'Graduate trainee at head office, then head offices and head quarters')).toEqual([]);
    expect(seniorityFlags('Graduate trainee', '', 'Graduate trainee at headquarters')).toEqual([]);
    expect(seniorityFlags('Marketing intern', '', 'Marketing lead for lead generation')).toEqual([raised('intern', 'lead')]);
    expect(seniorityFlags('Graduate trainee', '', 'Head of finance at head office')).toEqual([raised('Graduate', 'Head')]);
  });
  it('names the first senior word that is new, skipping ones already known', () => {
    expect(seniorityFlags('Trainee working with the manager', '', 'Trainee manager and team lead')).toEqual([raised('Trainee', 'lead')]);
  });
  it('does not let "lead generation" in the original make "lead" known', () => {
    expect(seniorityFlags('Intern supporting lead generation', '', 'Team lead for lead generation')).toEqual([raised('Intern', 'lead')]);
  });
  it('checks the original only for the junior word', () => {
    expect(seniorityFlags('Analyst', 'Graduate scheme', 'Senior analyst')).toEqual([]);
  });
});

describe('ownershipFlags, shared with Improve my CV', () => {
  it('is the same function Improve my CV imports', () => {
    expect(improveOwnershipFlags).toBe(ownershipFlags);
  });
  it('still uses the sources for weaker words and qualifiers, and still flags a stronger word that only the sources back', () => {
    expect(ownershipFlags('Finance analyst supporting month-end reporting.', 'Managed month-end reporting.', 'Finance analyst who managed month-end reporting.'))
      .toEqual([ownership('supporting', 'managed')]);
    expect(ownershipFlags('Reconciled supplier accounts.', 'Reconciled roughly 40 accounts.', 'Reconciled 40 supplier accounts.')).toEqual([dropped('roughly')]);
  });
  it('keeps the Improve my CV qualifier rule: no number needed, no swaps within a group', () => {
    expect(ownershipFlags('Advised SME clients about tax compliance.', '', 'Advised SME clients on tax compliance.')).toEqual([dropped('about')]);
    expect(ownershipFlags('Reconciled approximately 300 transactions daily.', '', 'Reconciled about 300 transactions daily.')).toEqual([dropped('approximately')]);
    expect(ownershipFlags('Trained more than 50 staff.', '', 'Trained over 50 staff.')).toEqual([dropped('more than')]);
  });
  it('counts the added shared-ownership co- words', () => {
    for (const word of ['Co-organised', 'Co-organized', 'Co-delivered', 'Co-sponsored', 'Co-produced', 'Co-edited', 'Co-taught', 'Co-teach', 'Co-convened', 'Co-moderated', 'Co-investigator on']) {
      expect(ownershipFlags(`${word} the programme.`, '', 'Ran the programme.').filter(f => f.startsWith('Drops'))).toEqual([dropped('co-')]);
    }
  });
});

describe('editFlags bullet by bullet', () => {
  const check = (before: string, after: string, quotes?: string[]) => editFlags(suggestion(before, after, quotes));
  it('flags a bullet that claims more ownership when another bullet already has a stronger word', () => {
    expect(check('• Led weekly huddles\n• Assisted the branch manager with loan files', '• Led weekly huddles\n• Managed loan files for 60 customers'))
      .toEqual([ownership('Assisted', 'Managed')]);
    expect(check('Managed petty cash of N500,000 monthly.\nSupported the audit team during year-end close.', 'Managed petty cash of N500,000 monthly.\nLed the audit team through year-end close.'))
      .toEqual([ownership('Supported', 'Led')]);
  });
  it('flags a qualifier dropped from one bullet while another bullet keeps it', () => {
    expect(check('Processed about 200 invoices weekly.\nReduced posting errors by about 15%.', 'Processed about 200 invoices weekly.\nReduced posting errors by 15%.'))
      .toEqual([dropped('about')]);
    expect(check('Helped onboard 3 new clients.\nHelped prepare the budget.', 'Helped onboard 3 new clients.\nPrepared the budget.')).toEqual([dropped('helped')]);
  });
  it('pairs each new bullet with the old bullet it shares most words with, so reordering raises no alarm', () => {
    // Paired by position, "Led weekly huddles" would meet the "Assisted" bullet; the evidence does not mention "Led".
    expect(check('• Led weekly huddles\n• Assisted the branch manager with loan files', '• Assisted the branch manager with loan files\n• Led weekly huddles', ['Assisted the branch manager with loan files.'])).toEqual([]);
    expect(check('Processed about 200 invoices weekly.\nReduced posting errors by about 15%.', 'Reduced posting errors by about 15%.\nProcessed about 200 invoices weekly.')).toEqual([]);
    expect(check('- Supported audits\n- Prepared reports', '- Prepared monthly reports\n- Supported 4 audits')).toEqual([]);
  });
  it('keeps the whole-field result', () => {
    expect(check('Supported the audit team.\nPrepared reports.', 'Led the audit team.\nPrepared reports.')).toEqual([ownership('Supported', 'Led')]);
  });
  it('leaves a single-line field as before', () => {
    expect(check('Led weekly huddles and assisted with loan files.', 'Led weekly huddles and managed loan files.')).toEqual([]);
    expect(check('Supported the audit team.', 'Led the audit team.\nPrepared reports.')).toEqual([ownership('Supported', 'Led')]);
  });
});

describe('editFlags numeric qualifiers (tailoring only)', () => {
  const check = (before: string, after: string) => editFlags(suggestion(before, after));
  it('ignores about and around when no number follows', () => {
    expect(check('Advised SME clients about tax compliance.', 'Advised 40 SME clients on tax compliance and VAT filing.')).toEqual([]);
    expect(check('Educated customers about new savings products.', 'Explained new savings products to customers, growing sign-ups.')).toEqual([]);
    expect(check('Travelled around the South-West to audit branches.', 'Audited branches across the South-West region.')).toEqual([]);
  });
  it('accepts a swap within the same group', () => {
    expect(check('Reconciled approximately 300 transactions daily.', 'Reconciled about 300 transactions daily.')).toEqual([]);
    expect(check('Cut costs by nearly 10%.', 'Cut costs by almost 10%.')).toEqual([]);
    expect(check('Managed roughly 40 accounts.', 'Managed ~40 accounts.')).toEqual([]);
    expect(check('Supported around 40 accounts.', 'Supported c. 40 accounts.')).toEqual([]);
    expect(check('Trained more than 50 staff on the new ERP.', 'Trained over 50 staff on the new ERP.')).toEqual([]);
    expect(check('Raised at least ₦2m for charity.', 'Raised more than ₦2m for charity.')).toEqual([]);
  });
  it('still flags a swap across groups', () => {
    expect(check('Trained more than 50 staff.', 'Trained about 50 staff.')).toEqual([dropped('more than')]);
  });
  it('flags a numeric qualifier that is dropped', () => {
    expect(check('Processed about 200 invoices a week.', 'Processed 200 invoices a week.')).toEqual([dropped('about')]);
    expect(check('Cut processing time by up to 40%.', 'Cut processing time by 40%.')).toEqual([dropped('up to')]);
    expect(check('Raised more than $5,000 for charity.', 'Raised $5,000 for charity.')).toEqual([dropped('more than')]);
    expect(check('Trained about fifty staff.', 'Trained fifty staff.')).toEqual([dropped('about')]);
    expect(check('Raised at least £300.', 'Raised £300.')).toEqual([dropped('at least')]);
  });
  it('still counts "part of", "co-" and "helped" without a number', () => {
    expect(check('Part of the team that launched the mobile app.', 'Launched the mobile app with a team of 6.')).toEqual([dropped('part of')]);
    expect(check('Helped customers resolve billing issues.', 'Resolved billing issues for customers.')).toEqual([dropped('helped')]);
  });
});

describe('editFlags checks every stronger word against the evidence', () => {
  it('flags and names the first stronger word the evidence does not back', () => {
    expect(editFlags(suggestion('Assisted with the quarterly audit.', 'Led the kickoff and managed the quarterly audit.', ['Led the kickoff meeting for the audit.'])))
      .toEqual([ownership('Assisted', 'managed')]);
  });
  it('does not fire when the evidence backs every stronger word', () => {
    expect(editFlags(suggestion('Assisted with the quarterly audit.', 'Led the kickoff and managed the quarterly audit.', ['Led the kickoff meeting.', 'Managed the quarterly audit.']))).toEqual([]);
  });
});

describe('more shared-ownership co- words', () => {
  it('flags co-organised dropped to organised', () => {
    expect(editFlags(suggestion('Co-organised the conference.', 'Organised the conference.'))).toEqual([dropped('co-')]);
  });
  it('does not treat co-curricular, co-educational or co-worker as shared ownership', () => {
    expect(editFlags(suggestion('Ran co-curricular clubs.', 'Ran after-school clubs.'))).toEqual([]);
    expect(editFlags(suggestion('Taught at a co-educational school.', 'Taught at a mixed school.'))).toEqual([]);
    expect(editFlags(suggestion('Trained a co-worker on Sage.', 'Trained a colleague on Sage.'))).toEqual([]);
  });
});

describe('school levels are not seniority', () => {
  it('does not treat junior or senior secondary as a level', () => {
    expect(editFlags(suggestion('Taught junior and senior secondary classes.', 'Taught senior secondary mathematics.'))).toEqual([]);
    expect(seniorityFlags('Graduate teacher of mathematics.', '', 'Graduate mathematics teacher for senior secondary classes.')).toEqual([]);
    expect(seniorityFlags('Graduate teacher of Mathematics at a junior secondary school.', '', 'Graduate Mathematics teacher for junior and senior secondary classes.')).toEqual([]);
  });
  it('still treats junior and senior as levels elsewhere', () => {
    expect(seniorityFlags('Junior teacher of mathematics.', '', 'Senior teacher of mathematics.')).toEqual([raised('Junior', 'Senior')]);
    expect(seniorityFlags('Graduate teacher at a senior secondary school.', '', 'Senior teacher at a senior secondary school.')).toEqual([raised('Graduate', 'Senior')]);
  });
});

describe('editFlags per-bullet seniority', () => {
  const check = (before: string, after: string, quotes: string[] = []) => editFlags(suggestion(before, after, quotes));
  it('flags a raise in one bullet when another bullet mentions the senior word', () => {
    expect(check('• Intern, finance\n• Supported the Senior Manager', '• Senior Analyst, finance\n• Supported the Senior Manager')).toEqual([raised('Intern', 'Senior')]);
    expect(check('• Intern, finance\n• Supported the Manager', '• Manager, finance\n• Supported the Manager')).toEqual([raised('Intern', 'Manager')]);
  });
  it('does not flag reordered bullets that each keep their own senior word', () => {
    expect(check('• Reported to the Senior Manager\n• Graduate trainee, audit', '• Graduate trainee, audit\n• Reported to the Senior Manager')).toEqual([]);
  });
  it('does not flag a bullet that keeps Senior Manager while another is unchanged', () => {
    expect(check('• Graduate trainee, audit\n• Reported to the Senior Manager', '• Graduate trainee, audit\n• Reported to the Senior Manager weekly')).toEqual([]);
  });
  it('still flags the raise when the evidence quotes the whole original field', () => {
    const before = '• Intern, finance\n• Supported the Senior Manager';
    expect(check(before, '• Senior Analyst, finance\n• Supported the Senior Manager', [before])).toEqual([raised('Intern', 'Senior')]);
  });
  it('still flags more ownership in one bullet when the evidence quotes the whole original field', () => {
    const before = '• Led weekly huddles\n• Assisted the branch manager with loan files';
    expect(check(before, '• Led weekly huddles\n• Led loan files for 60 customers', [before])).toEqual([ownership('Assisted', 'Led')]);
  });
  it('treats a field quote in other formatting as the field itself', () => {
    const before = '• Intern, finance\n• Supported the Senior Manager';
    const after = '• Senior Analyst, finance\n• Supported the Senior Manager';
    for (const quote of ['- Intern, finance\n- Supported the Senior Manager', 'Intern, finance\nSupported the Senior Manager',
      'Intern, finance … Supported the Senior Manager', 'Intern, finance... Supported the Senior Manager.']) {
      expect(check(before, after, [quote])).toEqual([raised('Intern', 'Senior')]);
    }
  });
  it('keeps a one-word answer as evidence when the field only has the letters inside another word', () => {
    expect(check('• Assisted with cash runs\n• Scheduled weekly shifts', '• Led cash runs\n• Scheduled weekly shifts', ['Led'])).toEqual([]);
  });
  it('lets evidence from elsewhere back a bullet', () => {
    const before = '• Led weekly huddles\n• Assisted the branch manager with loan files';
    expect(check(before, '• Led weekly huddles\n• Led loan files for 60 customers', [before, 'I led the loan files team for a year.'])).toEqual([]);
  });
});

describe('editFlags naira forms', () => {
  const check = (before: string, after: string) => editFlags(suggestion(before, after));
  it('counts NGN and "N " amounts as numbers', () => {
    expect(check('Managed about NGN 2m.', 'Managed NGN 2m.')).toEqual([dropped('about')]);
    expect(check('Managed about N 2m.', 'Managed N 2m.')).toEqual([dropped('about')]);
    expect(check('Managed about ₦2m.', 'Managed ₦2m.')).toEqual([dropped('about')]);
  });
  it('treats at least and more than as the same group for NGN', () => {
    expect(check('Managed at least NGN 2m.', 'Managed more than NGN 2m.')).toEqual([]);
  });
});

describe('editFlags pairing overlap', () => {
  const check = (before: string, after: string) => editFlags(suggestion(before, after, []));
  it('does not pair a new bullet that shares one incidental word', () => {
    // The whole field is clean (the old field has "Senior"); pairing on "audit" alone would raise seniority.
    expect(check('• Intern, audit support\n• Reported to the Senior Manager', '• Senior reviewer for the audit committee\n• Reported to the Senior Manager')).toEqual([]);
  });
  it('still pairs reworded bullets', () => {
    expect(check('• Led huddles\n• Processed about 200 invoices weekly', '• Led huddles\n• Processed 200 invoices weekly')).toEqual([dropped('about')]);
  });
});
