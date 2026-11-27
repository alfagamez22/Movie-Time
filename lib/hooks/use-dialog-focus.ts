'use client';

import { useEffect, useEffectEvent, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = 'a[href], button, input, select, textarea, iframe, summary, [tabindex], [contenteditable="true"]';

// Dialogs using this hook that are currently open, innermost last. Only the top one traps Tab, so a
// sign-in dialog stacked over the details dialog doesn't fight it for focus.
const openDialogs: symbol[] = [];

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.getClientRects().length > 0,
  );
}

interface DialogFocusOptions {
  /** Control to focus when the dialog opens. Defaults to the first focusable control. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Focus moves into the dialog when this turns true and returns to the opener when it turns false. */
  open: boolean;
  /** Stops trapping Tab without restoring focus, e.g. while a nested dialog that manages its own focus is open. */
  paused?: boolean;
}

/** Moves focus into a modal dialog, keeps Tab/Shift+Tab inside it, and restores focus to the opener on close. */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  { initialFocusRef, open, paused = false }: DialogFocusOptions,
) {
  const isPaused = useEffectEvent(() => paused);

  useEffect(() => {
    if (!open) return;

    const token = Symbol('dialog');
    openDialogs.push(token);
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    (initialFocusRef?.current ?? (container ? getFocusableElements(container)[0] : undefined))?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented || openDialogs.at(-1) !== token || isPaused()) return;
      const root = containerRef.current;
      if (!root) return;
      const active = document.activeElement;
      // Another modal (e.g. the trailer player) owns focus and runs its own trap.
      if (active instanceof HTMLElement && !root.contains(active) && active.closest('[aria-modal="true"]')) return;

      const controls = getFocusableElements(root);
      if (controls.length === 0) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!root.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = openDialogs.lastIndexOf(token);
      if (index !== -1) openDialogs.splice(index, 1);
      // preventScroll: returning focus must not yank the page to the opener (e.g. a card in a row).
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [containerRef, initialFocusRef, open]);
}
