'use client';
import { useEffect, useRef, useState } from 'react';

/** Paint the actual exported bytes, without depending on a browser PDF extension. */
export function ExactPdfPreview({ url }: { url: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Opening the exported PDF…');
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const host = container.current;
    async function render() {
      const pdfjs = await import('pdfjs-dist');
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = '/api/cv-studio/export?asset=pdf-worker&v=5.6.205-text';
      const task = pdfjs.getDocument(url);
      dispose = () => { void task.destroy(); };
      const pdf = await task.promise;
      if (cancelled || !host) return;
      if (pdf.numPages > 40) throw new Error('Download this long document to review all pages.');
      for (let number = 1; number <= pdf.numPages; number++) {
        if (cancelled) return;
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Exported PDF page ${number} of ${pdf.numPages}. Readable content is available in the live layout.`);
        await page.render({ canvas, viewport }).promise;
        if (!cancelled) host.appendChild(canvas);
      }
      if (!cancelled) setStatus(`${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} · rendered from the actual export`);
    }
    void render().catch(e => { if (!cancelled) setStatus('Preview could not open: ' + (e instanceof Error ? e.message : 'Please download the PDF.')); });
    return () => { cancelled = true; dispose?.(); host?.replaceChildren(); };
  }, [url]);
  return <div className="exact-pdf"><p role="status">{status}</p><div ref={container} /></div>;
}
