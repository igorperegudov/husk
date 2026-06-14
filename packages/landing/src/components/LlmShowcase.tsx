import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  CornerDownRight,
  Globe,
  KeyRound,
  Server,
  ShieldCheck,
  User,
  Wrench,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { LLM_PROVIDERS, LLM_SKILL, LLM_TURNS, type LlmRole } from '../lib/content';
import { CodeBlock, Container, Reveal, SectionHeading } from './ui';

const roleMeta: Record<LlmRole, { icon: typeof Bot; chip: string }> = {
  user: { icon: User, chip: 'border-line text-ink' },
  model: { icon: Bot, chip: 'border-brand/40 bg-brand/10 text-brand' },
  tool: { icon: Wrench, chip: 'border-line text-mute' },
};

function Turn({ index }: { index: number }) {
  const turn = LLM_TURNS[index];
  const meta = roleMeta[turn.role];
  const Icon = meta.icon;
  const isCall = turn.role === 'tool' || (turn.role === 'model' && turn.text.includes('('));
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 + index * 0.18 }}
      className="flex items-start gap-3"
    >
      <span
        className={cn(
          'inline-flex w-24 shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]',
          meta.chip,
        )}
      >
        <Icon className="h-3 w-3 shrink-0" />
        {turn.label}
      </span>
      <span
        className={cn(
          'pt-1 text-sm leading-relaxed',
          isCall ? 'font-mono text-ink/85' : 'text-ink/90',
        )}
      >
        {turn.role === 'model' && isCall && (
          <CornerDownRight className="mr-1 inline h-3.5 w-3.5 text-brand" />
        )}
        {turn.text}
      </span>
    </motion.div>
  );
}

function KeyStep({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex-1 rounded-xl border px-4 py-3',
        highlight ? 'border-brand/40 bg-brand/[0.06]' : 'border-line bg-ink/[0.02]',
      )}
    >
      <div className="flex items-center gap-2 text-xs text-mute">
        <Icon className="h-3.5 w-3.5 text-brand" />
        {label}
      </div>
      <div className="mt-1 break-all font-mono text-xs text-ink/85">{value}</div>
    </div>
  );
}

function FlowArrow() {
  return <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-mute sm:rotate-0" />;
}

export default function LlmShowcase() {
  return (
    <section id="llm" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="LLM-native"
          title="Your SKILL.md is the system prompt"
          subtitle="Set mode: llm and an LLM runs the skill - it reads the body as its system prompt and calls the tools you declare, looping until it has an answer. No agent framework, no glue code."
        />

        <div className="mx-auto mt-14 grid max-w-5xl items-stretch gap-6 lg:grid-cols-2">
          <Reveal>
            <CodeBlock
              code={LLM_SKILL}
              filename="skills/site-checker/SKILL.md"
              className="h-full"
            />
          </Reveal>

          <Reveal delay={0.05}>
            <div className="glass flex h-full flex-col rounded-2xl">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="font-mono text-xs text-brand">POST</span>
                <span className="font-mono text-xs text-mute">/skills/site-checker</span>
                <span className="ml-auto font-mono text-[10px] text-brand/70">agent loop</span>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-5 p-5">
                {LLM_TURNS.map((_, i) => (
                  <Turn key={i} index={i} />
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {LLM_PROVIDERS.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-line bg-ink/[0.04] px-3 py-1.5 font-mono text-xs text-mute"
                >
                  {p}
                </span>
              ))}
            </div>
            <p className="text-center text-sm text-mute">
              Bring your own key. husk calls the provider&apos;s API at invoke time and bundles no
              model.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="glass mx-auto mt-6 max-w-3xl rounded-2xl p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck className="h-4 w-4 text-brand" />
              Your API key never leaves the server
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <KeyStep icon={KeyRound} label="your env" value="ANTHROPIC_API_KEY" />
              <FlowArrow />
              <KeyStep icon={Server} label="husk serve" value="injects the key" highlight />
              <FlowArrow />
              <KeyStep icon={Globe} label="provider" value="api.anthropic.com" />
            </div>

            <p className="mt-5 text-sm leading-relaxed text-mute">
              Set it once when you start husk -{' '}
              <code className="rounded bg-ink/[0.07] px-1.5 py-0.5 font-mono text-[0.85em] text-brand">
                ANTHROPIC_API_KEY=sk-... husk serve
              </code>
              . Clients call the skill with no credentials; husk adds the key to the provider
              request server-side, and tool scripts run with provider keys withheld. The same goes
              for <span className="text-ink/80">mode: proxy</span> - {'${VAR}'} headers are resolved
              on the server, so secrets never reach the browser.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
