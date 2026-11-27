import { describe, expect, it } from 'vitest';
import { displayTopics, tidyTopicName } from './topic-display';

describe('tidyTopicName', () => {
  it('turns capitals into title case, keeping small words lower case', () => {
    expect(tidyTopicName('TEAM PERFORMANCE DOMAIN')).toBe('Team Performance Domain');
    expect(tidyTopicName('KEY CONCEPTS FOR PROJECT RISK MANAGEMENT')).toBe('Key Concepts for Project Risk Management');
    expect(tidyTopicName('A GUIDE TO THE PROJECT')).toBe('A Guide to the Project');
  });

  it('keeps known abbreviations and anything in brackets in capitals', () => {
    expect(tidyTopicName('PROJECT MANAGEMENT INFORMATION SYSTEM (PMIS)')).toBe('Project Management Information System (PMIS)');
    expect(tidyTopicName('CREATE WBS')).toBe('Create WBS');
    expect(tidyTopicName('FMEA/FAULT TREE ANALYSIS')).toBe('FMEA/Fault Tree Analysis');
    expect(tidyTopicName('SWOT ANALYSIS')).toBe('SWOT Analysis');
  });

  it('handles hyphens, slashes and apostrophes', () => {
    expect(tidyTopicName('HIGH-PERFORMING PROJECT TEAMS')).toBe('High-Performing Project Teams');
    expect(tidyTopicName('I-SHAPED PEOPLE AND T-SHAPED PEOPLE')).toBe('I-Shaped People and T-Shaped People');
    expect(tidyTopicName('ACCESS TO THE CUSTOMER/BUSINESS')).toBe('Access to the Customer/Business');
    expect(tidyTopicName("SERVANT LEADERS PAVE THE WAY FOR OTHERS'")).toBe("Servant Leaders Pave the Way for Others'");
  });

  it('leaves names that already use mixed case alone', () => {
    expect(tidyTopicName('Budget and Resources')).toBe('Budget and Resources');
    expect(tidyTopicName('Project Management Knowledge Areas')).toBe('Project Management Knowledge Areas');
  });

  it('repairs the broken registered sign after PMBOK and drops other broken characters', () => {
    expect(tidyTopicName('CHANGES TO THE PMBOK� GUIDE')).toBe('Changes to the PMBOK® Guide');
    expect(tidyTopicName('ODD� NAME')).toBe('Odd Name');
  });

  it('marks a heading cut off mid-phrase with an ellipsis', () => {
    expect(tidyTopicName('ENTERPRISE ENVIRONMENTAL FACTORS AND')).toBe('Enterprise Environmental Factors and…');
    expect(tidyTopicName('RISK MANAGEMENT CONTROLS FOR')).toBe('Risk Management Controls for…');
  });
});

describe('displayTopics', () => {
  it('splits the section number from the name', () => {
    expect(displayTopics(['2.2.1 PROJECT TEAM MANAGEMENT AND LEADERSHIP', 'X6.2.14 SWOT ANALYSIS', 'X5.2 PROJECT SCOPE MANAGEMENT'])).toEqual([
      { number: '2.2.1', name: 'Project Team Management and Leadership' },
      { number: 'X6.2.14', name: 'SWOT Analysis' },
      { number: 'X5.2', name: 'Project Scope Management' },
    ]);
  });

  it('drops placeholders and page furniture', () => {
    expect(
      displayTopics([
        'Section 94',
        'TABLE OF CONTENTS',
        'PREFACE',
        'III NOTICE',
        'NOTICE',
        'PMI-RMP, PMP',
        'MBA, PMP',
        'I A R C C',
        'DEVELOP TEAM',
      ])
    ).toEqual([{ name: 'Develop Team' }]);
  });

  it('drops a page number in front of a heading', () => {
    expect(displayTopics(['112 APPENDIX X1'])).toEqual([{ name: 'Appendix X1' }]);
  });

  it('removes repeats, keeping the first', () => {
    expect(displayTopics(['COLLECT REQUIREMENTS', 'Collect requirements', 'DEFINE SCOPE', 'COLLECT REQUIREMENTS'])).toEqual([
      { name: 'Collect Requirements' },
      { name: 'Define Scope' },
    ]);
  });

  it('keeps a numbered sentence whole rather than splitting it oddly', () => {
    expect(displayTopics(['2.4.2 of the PMBOK Guide defines phases'])).toEqual([
      { name: '2.4.2 of the PMBOK Guide defines phases' },
    ]);
  });

  it('never returns an empty name, and copes with an empty list', () => {
    expect(displayTopics(['   ', '�', '1.2.3'])).toEqual([]);
    expect(displayTopics([])).toEqual([]);
  });

  it('does not change the list it was given', () => {
    const topics = ['TEAM PERFORMANCE DOMAIN', 'Section 5'];
    displayTopics(topics);
    expect(topics).toEqual(['TEAM PERFORMANCE DOMAIN', 'Section 5']);
  });
});
