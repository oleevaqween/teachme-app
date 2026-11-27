import { describe, expect, it, vi } from 'vitest';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { practiceClaimUrl } from '@/lib/practice/claims';
import { saveThenPractise } from './defend-claim';

const BULLET = 'Managed a budget of ₦2,000,000.';

describe('defending a claim from CV Studio', () => {
  it('saves the CV first, then opens Mock Interview on that bullet', async () => {
    const order: string[] = [];
    await saveThenPractise(fixture(), 'experience.e1', BULLET, {
      save: async w => { order.push('save:' + w.id); },
      go: url => { order.push('go:' + url); },
    });
    expect(order).toEqual(['save:fixture', 'go:' + practiceClaimUrl('fixture', 'experience.e1', BULLET)]);
  });

  it('stays on the page when the save fails', async () => {
    const go = vi.fn();
    await expect(saveThenPractise(fixture(), 'experience.e1', BULLET, {
      save: async () => { throw new Error('Saving is paused to protect conflicting changes.'); }, go,
    })).rejects.toThrow('Saving is paused');
    expect(go).not.toHaveBeenCalled();
  });
});
