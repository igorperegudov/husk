import { motion } from 'framer-motion';
import { FEATURES, INSTALL, LINKS, RUNTIMES, VALUE_PROPS } from '../lib/content';
import { fadeUp, inView, stagger } from '../lib/motion';
import { GitHubIcon } from './icons';
import {
  ArrowUpRight,
  Container,
  CopyCommand,
  GlassCard,
  LinkButton,
  Reveal,
  SectionHeading,
} from './ui';

export function ValueProps() {
  return (
    <section id="why" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="The idea"
          title="No SDK. No rewrite. Just a folder."
          subtitle="husk reuses what you already have - a script and a one-page manifest - and turns it into a service."
        />
        <motion.div
          variants={stagger(0.07)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {VALUE_PROPS.map((v) => (
            <motion.div key={v.title} variants={fadeUp}>
              <GlassCard className="h-full">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand/25 bg-brand/10 text-brand">
                  <v.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{v.body}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Batteries included"
          title="Everything a backend needs, generated"
          subtitle="Discovery, a typed spec, streaming, file handling and containers - without writing the plumbing."
        />
        <motion.div
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <motion.div key={f.title} variants={fadeUp}>
              <GlassCard className="h-full p-5">
                <f.icon className="h-5 w-5 text-brand" />
                <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mute">{f.body}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export function Runtimes() {
  return (
    <section id="runtimes" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="One skill, three runtimes"
          title="Same folder. Server, function, or container."
          subtitle="Write the skill once. Run it however the deployment calls for - no redesign between them."
        />
        <motion.div
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="mt-14 grid gap-5 md:grid-cols-3"
        >
          {RUNTIMES.map((r) => (
            <motion.div key={r.cmd} variants={fadeUp}>
              <GlassCard className="h-full">
                <code className="inline-block rounded-lg border border-brand/20 bg-brand/5 px-3 py-1.5 font-mono text-sm text-brand">
                  {r.cmd}
                </code>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{r.body}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="relative py-28 sm:py-36">
      <Container>
        <Reveal>
          <div className="glass relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12 sm:py-20">
            <div className="absolute inset-0 -z-10 bg-dotgrid opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            <div
              aria-hidden
              className="absolute left-1/2 top-0 -z-10 h-64 w-[600px] -translate-x-1/2 rounded-full blur-[120px]"
              style={{
                background: 'radial-gradient(circle, rgba(63,224,123,0.18), transparent 70%)',
              }}
            />
            <h2 className="mx-auto max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Wrap your first skill in <span className="text-brand text-glow">a minute</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-pretty leading-relaxed text-mute">
              Install the CLI, point it at a folder, and you have an HTTP backend. The docs walk you
              through the rest.
            </p>
            <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-4">
              <CopyCommand command={INSTALL} className="w-full" />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <LinkButton href={LINKS.docs} external>
                  Read the docs
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </LinkButton>
                <LinkButton href={LINKS.github} variant="ghost" external>
                  <GitHubIcon className="h-4 w-4" />
                  Star on GitHub
                </LinkButton>
              </div>
            </div>
            <p className="mx-auto mt-6 max-w-md text-xs leading-relaxed text-mute">
              Already installed? Update with{' '}
              <code className="rounded bg-ink/[0.07] px-1.5 py-0.5 font-mono text-brand">
                bun add -g @elisym/husk@latest
              </code>{' '}
              - then restart your shell so the new version is picked up.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
