import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '../lib/cn';
import { USE_CASES } from '../lib/content';
import { fadeUp, inView, stagger } from '../lib/motion';
import { Container, GlassCard, Reveal, SectionHeading } from './ui';

const flow = [
  { label: 'Your app', sub: 'web - mobile - backend' },
  { label: 'API gateway', sub: 'auth - limits - access', accent: true },
  { label: 'husk', sub: 'skills as endpoints', brand: true },
  { label: 'LLM providers', sub: 'anthropic - openai - ...' },
];

export default function UseCases() {
  return (
    <section id="why-husk" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Why husk - who it is for"
          title="Ship LLM features without the plumbing"
          subtitle="If your product talks to an LLM, husk is where that logic lives. Deploy your prompts, tools and agents as HTTP endpoints - then put your own gateway in front for auth, rate limits and access control."
        />

        {/* your app -> gateway -> husk -> providers */}
        <Reveal>
          <div className="mx-auto mt-12 flex max-w-4xl flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {flow.map((n, i) => (
              <Fragment key={n.label}>
                <div
                  className={cn(
                    'flex-1 rounded-xl border px-4 py-3 text-center',
                    n.brand
                      ? 'border-brand/40 bg-brand/[0.07]'
                      : n.accent
                        ? 'border-brand/25 bg-ink/[0.02]'
                        : 'border-line bg-ink/[0.02]',
                  )}
                >
                  <div
                    className={cn(
                      'font-mono text-sm font-semibold',
                      n.brand ? 'text-brand' : 'text-ink',
                    )}
                  >
                    {n.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-mute">{n.sub}</div>
                </div>
                {i < flow.length - 1 && (
                  <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-mute sm:rotate-0" />
                )}
              </Fragment>
            ))}
          </div>
        </Reveal>

        {/* use cases */}
        <motion.div
          variants={stagger(0.06)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {USE_CASES.map((u) => (
            <motion.div key={u.title} variants={fadeUp}>
              <GlassCard className="h-full">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand/25 bg-brand/10 text-brand">
                  <u.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{u.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{u.body}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}
