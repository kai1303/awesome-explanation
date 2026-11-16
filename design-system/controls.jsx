import React, { forwardRef } from 'react';
import { Button } from '@astryxdesign/core/Button';

export const CommandRow = forwardRef(function CommandRow({ active, ...props }, ref) {
  return <Button {...props} ref={ref} className="command-row" size="sm" variant="ghost" data-active={active} />;
});

export function Disclosure({ label, expanded, controls, disabled, onClick, variant = 'ghost', ...props }) {
  return <Button {...props} label={label} endContent={<span aria-hidden="true">{expanded ? '−' : '+'}</span>}
    aria-expanded={expanded} aria-controls={controls} size="sm" variant={variant}
    isDisabled={disabled} onClick={onClick} />;
}
