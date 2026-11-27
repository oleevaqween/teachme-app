export function limitedAnswer(value: string): 'none' | 'unsure' | null {
  const text = value.toLowerCase().trim().replace(/[’']/g, '').replace(/[.!?,;]+$/g, '').trim().replace(/\s+/g, ' ');
  if (/^(no|none|nope|nil|n\/?a|not applicable|not yet|none yet|no experience|i have none|i dont have any)$/.test(text)) return 'none';
  if (text === 'i do not have a relevant example or evidence to add for this question at present') return 'none';
  if (text === 'i am not certain about this detail and need to verify it before making a claim') return 'unsure';
  if (/^(i (dont|do not) know|dont know|do not know|i (am |m )?not sure|not sure|unsure|unknown|i (cant|cannot|can not) remember|cant remember|i dont recall)$/.test(text)) return 'unsure';
  return null;
}
export function unfinishedOutline(answer: { answer: string; assistance?: { kind: string } }) {
  return answer.assistance?.kind === 'outline' && /\[[^\]]+\]/.test(answer.answer);
}
