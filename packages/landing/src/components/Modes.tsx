import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { MODES } from '../lib/content';
import { CodeBlock, Container, SectionHeading } from './ui';

export default function Modes() {
  const [active, setActive] = useState(0);
  const mode = MODES[active];

  return (
    <section id="modes" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="One folder, four behaviors"
          title="An LLM agent, a script, a proxy, or a file"
          subtitle="Every skill declares how it runs. Switch behavior by editing the manifest - the HTTP surface stays the same."
        />

        <div className="mx-auto mt-14 max-w-3xl">
          <div
            role="tablist"
            aria-label="Skill modes"
            className="flex flex-wrap justify-center gap-2"
          >
            {MODES.map((m, i) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={active === i}
                onClick={() => setActive(i)}
                className={cn(
                  'relative cursor-pointer rounded-xl px-4 py-2 font-mono text-sm transition-colors',
                  active === i ? 'text-on-brand' : 'text-mute hover:text-ink',
                )}
              >
                {active === i && (
                  <motion.span
                    layoutId="mode-pill"
                    className="absolute inset-0 -z-10 rounded-xl bg-brand"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                {m.name}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="mt-8"
            >
              <p className="mb-4 text-center text-pretty leading-relaxed text-mute">
                {mode.tagline}
              </p>
              <CodeBlock code={mode.snippet} filename={`mode: ${mode.name}`} />
            </motion.div>
          </AnimatePresence>
        </div>
      </Container>
    </section>
  );
}
