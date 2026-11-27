import { defaultLayout, emptyResume, type Workspace } from './schema';
export const fixture = (): Workspace => ({
  id: 'fixture', name: 'Example application', kind: 'application', parentId: 'master',
  resume: { ...emptyResume(), personal: { fullName: 'Ada Okoro', professionalTitle: 'Project Manager', email: 'ada@example.com', phone: '+234 800 000 0000', location: 'Lagos, Nigeria', linkedin: '' },
    summary: 'Project manager supporting delivery teams.',
    experience: [{ id: 'e1', company: 'Example Ltd', title: 'Project Manager', location: 'Lagos', startDate: '2020', endDate: '2024', achievements: 'Managed a budget of ₦2,000,000.\nPrepared monthly reports for 4 stakeholders.' }],
    skills: 'Reporting, stakeholder management', education: [{ id: 'ed1', institution: 'Example University', degree: 'BSc Management', graduationYear: '2019' }] },
  layout: structuredClone(defaultLayout), jobDescription: 'We require stakeholder management and monthly reporting. Power BI is desirable.',
  evidenceNotes: '', analysis: null, analysisInput: null, package: null, packageInput: null,
});

