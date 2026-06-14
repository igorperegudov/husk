import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { LINKS } from '../lib/content';
import { useTheme } from '../lib/theme';
import Logo from './Logo';
import { ArrowUpRight } from './ui';

const navLinks = [
  { label: 'Docs', href: LINKS.docs },
  { label: 'GitHub', href: LINKS.github },
  { label: 'npm', href: LINKS.npm },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-line text-mute transition-colors hover:bg-ink/[0.06] hover:text-ink"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export default function Nav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 16));

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div
        className={cn(
          'mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3 transition-all duration-300 sm:px-6',
          scrolled ? 'glass mx-3 sm:mx-auto' : 'border border-transparent',
        )}
      >
        <a href="#top" aria-label="husk home">
          <Logo />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm font-medium text-mute transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <a
            href={LINKS.docs}
            target="_blank"
            rel="noreferrer noopener"
            className="group inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-4 py-2 text-sm font-semibold text-on-brand transition-all duration-200 hover:brightness-105 active:scale-[0.97]"
          >
            Read the docs
            <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </motion.header>
  );
}
