'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Window event a popover dispatches when it opens, so the others close. */
export const POPOVER_OPEN_EVENT = 'teachme:popover-open';

export type PopoverEvent =
  | { type: 'toggle' }
  | { type: 'escape' }
  | { type: 'pointerdown'; inside: boolean }
  | { type: 'other-opened'; openedId: string; selfId: string };

/** Pure open/close decision: what a popover's state becomes after an event. */
export function popoverNextOpen(open: boolean, event: PopoverEvent): boolean {
  switch (event.type) {
    case 'toggle':
      return !open;
    case 'escape':
      return false;
    case 'pointerdown':
      return event.inside ? open : false;
    case 'other-opened':
      return event.openedId === event.selfId ? open : false;
  }
}

/** On Escape, focus goes back to the button only when it is inside the popover (panel or button). */
export function escapeShouldRefocus(focusInside: boolean): boolean {
  return focusInside;
}

/**
 * A pill button in the lesson header that opens a small panel below it. Closes on
 * Escape (focus returns to the button when it was inside the popover), on a pointerdown outside, and when another
 * popover opens. `initialOpen` exists for tests only.
 */
export function HeaderPopover({
  label,
  children,
  id,
  align = 'end',
  initialOpen = false,
}: {
  label: string;
  children: ReactNode;
  id: string;
  /** Which edge of the button the panel lines up with from `sm` up: the right edge (end) or the left edge (start). */
  align?: 'start' | 'end';
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen((value) => popoverNextOpen(value, { type: 'escape' }));
      const focusInside = !!rootRef.current?.contains(document.activeElement);
      if (escapeShouldRefocus(focusInside)) buttonRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const inside = !!rootRef.current?.contains(e.target as Node);
      setOpen((value) => popoverNextOpen(value, { type: 'pointerdown', inside }));
    };
    const onOther = (e: Event) => {
      const openedId = String((e as CustomEvent<string>).detail);
      setOpen((value) => popoverNextOpen(value, { type: 'other-opened', openedId, selfId: id }));
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener(POPOVER_OPEN_EVENT, onOther);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener(POPOVER_OPEN_EVENT, onOther);
    };
  }, [open, id]);

  const toggle = () => {
    if (!open) window.dispatchEvent(new CustomEvent(POPOVER_OPEN_EVENT, { detail: id }));
    setOpen((value) => popoverNextOpen(value, { type: 'toggle' }));
  };

  return (
    <div ref={rootRef} className="static sm:relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-small text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <ChevronDown
          className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={id}
          className={cn(
            'absolute inset-x-4 top-full z-20 mt-1 max-h-72 overflow-y-auto sm:inset-x-auto sm:w-[22rem]',
            align === 'start' ? 'sm:left-0' : 'sm:right-0',
            'rounded-lg border border-border bg-card p-3 text-foreground shadow-lg'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
