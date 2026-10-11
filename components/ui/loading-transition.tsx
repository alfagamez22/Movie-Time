'use client';

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';

import { LoadingScreen } from './loading-indicator';

function LoadingOverlay({ label }: { label: string }) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className="fixed inset-0 z-[200]"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden={!present || undefined}
      style={{ pointerEvents: present ? 'auto' : 'none' }}
      data-loading-transition={present ? 'loading' : 'revealing'}
    >
      <LoadingScreen label={label} />
    </motion.div>
  );
}

export function LoadingTransition({ active, label }: { active: boolean; label: string }) {
  return (
    <AnimatePresence initial={false}>
      {active ? <LoadingOverlay key="loading" label={label} /> : null}
    </AnimatePresence>
  );
}
