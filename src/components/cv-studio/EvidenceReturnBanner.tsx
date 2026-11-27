'use client';
import { X } from 'lucide-react';

/** Shown on the application a finished Teach Me journey came from; nothing is added until the button is pressed. */
export function EvidenceReturnBanner({ topic, disabled, onAdd, onDismiss }: { topic: string; disabled: boolean; onAdd: () => void; onDismiss: () => void }) {
  return <div className="studio-notice" role="status">
    <span>You finished a Teach Me journey on {topic}. Add evidence only for what you have actually done.</span>
    <button type="button" className="studio-button secondary" disabled={disabled} onClick={onAdd}>Add evidence for {topic}</button>
    <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}><X size={16} aria-hidden="true" /></button>
  </div>;
}
