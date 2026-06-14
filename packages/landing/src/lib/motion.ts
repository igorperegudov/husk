import type { Transition, Variants } from 'framer-motion';

/** Soft, expensive-feeling ease used across the page. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const spring: Transition = { type: 'spring', stiffness: 220, damping: 26, mass: 0.9 };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: EASE } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 16 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Parent that staggers its children's `hidden -> show` transition. */
export const stagger = (gap = 0.07, delay = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Shared `whileInView` viewport config: reveal once, slightly before fully on-screen. */
export const inView = { once: true, margin: '-80px' } as const;
