import { motion } from 'framer-motion';
import { STEPS } from '../lib/content';
import { fadeUp, inView } from '../lib/motion';
import { CodeBlock, Container, SectionHeading } from './ui';

export default function HowItWorks() {
  return (
    <section id="how" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Prefer to do it by hand"
          title="Four steps to a running backend"
          subtitle="The same result, wired by hand - install, write a skill, point husk at the folder, and call it."
        />

        <div className="relative mt-16">
          {/* Spine */}
          <div className="absolute left-[19px] top-2 bottom-2 hidden w-px bg-gradient-to-b from-brand/40 via-line to-transparent sm:block" />

          <ol className="flex flex-col gap-10">
            {STEPS.map((step, i) => (
              <motion.li
                key={step.n}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={inView}
                transition={{ delay: i * 0.04 }}
                className="grid gap-5 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-7"
              >
                <div className="relative z-10 hidden sm:block">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-brand/30 bg-canvas font-mono text-sm font-semibold text-brand shadow-[0_0_20px] shadow-brand/20">
                    {step.n}
                  </span>
                </div>

                <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:items-start md:gap-8">
                  <div className="md:pt-1">
                    <div className="mb-2 flex items-center gap-2 sm:hidden">
                      <span className="font-mono text-xs text-brand">{step.n}</span>
                    </div>
                    <h3 className="text-xl font-semibold tracking-tight">{step.title}</h3>
                    <p className="mt-2 text-pretty leading-relaxed text-mute">{step.body}</p>
                  </div>

                  <div className="flex min-w-0 flex-col gap-3">
                    {step.files.map((file) => (
                      <CodeBlock
                        key={file.name ?? file.code}
                        code={file.code}
                        filename={file.name}
                      />
                    ))}
                  </div>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
