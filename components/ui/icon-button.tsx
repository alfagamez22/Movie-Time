'use client';

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type Ref } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  ref?: Ref<HTMLButtonElement>;
};

export function IconButton({ label, ref, children, onMouseEnter, onMouseLeave, onFocus, onBlur, onClick, ...props }: IconButtonProps) {
  const button = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const labelFrame = useRef<number | null>(null);
  const tooltipId = useId();

  useEffect(() => {
    const dismiss = () => {
      if (labelFrame.current !== null) cancelAnimationFrame(labelFrame.current);
      labelFrame.current = null;
      if (tooltip.current?.matches(':popover-open')) tooltip.current.hidePopover();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => { dismiss(); window.removeEventListener('scroll', dismiss, true); window.removeEventListener('resize', dismiss); };
  }, []);

  const hideLabel = () => {
    if (labelFrame.current !== null) cancelAnimationFrame(labelFrame.current);
    labelFrame.current = null;
    if (tooltip.current?.matches(':popover-open')) tooltip.current.hidePopover();
  };
  const showLabel = () => {
    if (labelFrame.current !== null) cancelAnimationFrame(labelFrame.current);
    // Menu focus can occur during showPopover; wait until that operation finishes.
    labelFrame.current = requestAnimationFrame(() => {
      labelFrame.current = null;
      if (!button.current?.isConnected || !tooltip.current?.isConnected || button.current.getAttribute('aria-expanded') === 'true') return;
      const bounds = button.current.getBoundingClientRect();
      if (!tooltip.current.matches(':popover-open')) tooltip.current.showPopover();
      const hint = tooltip.current.getBoundingClientRect();
      tooltip.current.style.left = `${Math.max(8, Math.min(bounds.left + bounds.width / 2 - hint.width / 2, window.innerWidth - hint.width - 8))}px`;
      tooltip.current.style.top = `${bounds.top >= hint.height + 12 ? bounds.top - hint.height - 8 : bounds.bottom + 8}px`;
    });
  };

  return <>
    <button {...props} type={props.type ?? 'button'} aria-label={props['aria-label'] ?? label} aria-describedby={tooltipId}
      ref={(element) => {
        button.current = element;
        if (typeof ref === 'function') return ref(element);
        if (ref) ref.current = element;
      }}
      onMouseEnter={(event) => { showLabel(); onMouseEnter?.(event); }}
      onMouseLeave={(event) => { hideLabel(); onMouseLeave?.(event); }}
      onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) showLabel(); onFocus?.(event); }}
      onBlur={(event) => { hideLabel(); onBlur?.(event); }}
      onClick={(event) => { hideLabel(); onClick?.(event); }}>
      {children}
    </button>
    <div ref={tooltip} id={tooltipId} role="tooltip" popover="manual"
      style={{ position: 'fixed', inset: 'auto', margin: 0 }}
      className="pointer-events-none max-w-[calc(100vw-16px)] rounded bg-white px-3 py-2 text-center text-xs font-bold text-black shadow-xl">
      {label}
    </div>
  </>;
}
