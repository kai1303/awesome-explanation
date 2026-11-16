import React, { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { revealInspector } from '../topics/chart-motion.js';

// Some diagrams rebuild their rows during playback. The caller resolves the
// current opener on close. An outside click keeps focus on its new destination.
export function StagePopover({ id, title, subtitle, children, onDismiss, open = true, wide = false, focusKey, keepOpen }) {
  const titleId = useId();
  const subtitleId = useId();
  const panel = useRef(null);
  const heading = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    heading.current.focus({preventScroll:true});
    const motion = revealInspector(panel.current);
    return () => motion?.revert();
  }, [open, title, focusKey]);

  useEffect(() => {
    if (!open) return;
    function escape(event) {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open], [role=combobox][aria-expanded=true]')) return;
      event.preventDefault();
      onDismiss(true);
    }
    function outside(event) {
      if (panel.current.contains(event.target) || event.target.closest('[aria-controls~="' + id + '"]')) return;
      if (keepOpen && event.target.closest(keepOpen)) return;
      onDismiss(false);
    }
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open, id, keepOpen, onDismiss]);

  return <Card ref={panel} id={id} hidden={!open} role="dialog" aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined}
    className={'stage-inspector' + (wide ? ' operation-inspector' : '')} padding={4}>
    <div className="inspection-heading">
      <div>
        <h2 id={titleId} tabIndex={-1} ref={heading}>{title}</h2>
        {subtitle && <p id={subtitleId} className="inspection-subtitle">{subtitle}</p>}
      </div>
      <Button label="Close" size="sm" variant="ghost" onClick={() => onDismiss(true)} />
    </div>
    <div className="inspection-content">{children}</div>
  </Card>;
}

export function CalculationDialog({ id, title, subtitle, wide = false, onDismiss, children }) {
  const close = () => onDismiss(true);
  return <Dialog id={id} isOpen onOpenChange={close} padding={4} maxHeight="85dvh"
    width={wide ? 'min(700px, calc(100vw - 24px))' : 'min(560px, calc(100vw - 24px))'}
    aria-label={[title, subtitle].filter(Boolean).join(' · ')}>
    <DialogHeader title={title} subtitle={subtitle} onOpenChange={close} />
    <div className="calculation-content">{children}</div>
  </Dialog>;
}
