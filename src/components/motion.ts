"use client";

import { motion, useReducedMotion } from "framer-motion";

export { motion, useReducedMotion };

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

export const stagger = (delayChildren = 0.05, staggerChildren = 0.08) => ({
  hidden: {},
  show: {
    transition: { delayChildren, staggerChildren },
  },
});

export const viewportOnce = { once: true, amount: 0.2 } as const;
