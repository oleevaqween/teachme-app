import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProviderConfig } from './ProviderConfig';
import { BackupCard } from '@/components/backup/BackupCard';
import { FileList } from '@/components/documents/FileList';

function tags(html: string, tag: string): string[] {
  return html.match(new RegExp(`<${tag}\\s[^>]*>`, 'g')) ?? [];
}

describe('provider settings type scale', () => {
  const html = renderToStaticMarkup(<ProviderConfig providerType="ollama-cloud" onSaved={() => {}} />);

  it('puts text-body on inputs and selects', () => {
    const fields = [...tags(html, 'input'), ...tags(html, 'select')];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(field).toContain('text-body');
  });

  it('puts text-small on labels', () => {
    const labels = tags(html, 'label');
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).toContain('text-small');
  });

  it('uses the theme gold for the save button', () => {
    expect(html).toContain('bg-primary text-primary-foreground');
  });
});

describe('backup card and file list', () => {
  it('backup button uses the theme gold and a card-title heading', () => {
    const html = renderToStaticMarkup(<BackupCard />);
    expect(html).toContain('bg-primary');
    expect(html).toContain('text-lead');
    expect(html).not.toContain('amber');
  });

  it('file list badges use the type scale', () => {
    const file = new File(['x'], 'a.docx');
    const html = renderToStaticMarkup(<FileList files={[file]} onRemove={() => {}} />);
    expect(html).toContain('text-label');
    expect(html).toContain('text-caption');
    expect(html).not.toContain('amber');
  });
});
