import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '../lib/cn';
import { DEMO_SKILLS } from '../lib/content';
import { Container, SectionHeading } from './ui';

export default function Demo() {
  const [idx, setIdx] = useState(0);
  const skill = DEMO_SKILLS[idx];
  const [input, setInput] = useState(DEMO_SKILLS[0].sample);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const select = useCallback((i: number) => {
    setIdx(i);
    setInput(DEMO_SKILLS[i].sample);
    setOutput(null);
  }, []);

  const command = useMemo(() => {
    const base = `curl -sX POST http://localhost:3000/skills/${skill.slug}`;
    return skill.input === 'none' ? base : `${base} \\\n  --data '${input}'`;
  }, [skill, input]);

  const run = useCallback(() => {
    setRunning(true);
    setOutput(null);
    setTimeout(() => {
      setOutput(skill.run(input));
      setRunning(false);
    }, 420);
  }, [skill, input]);

  return (
    <section id="try" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Try it"
          title="See a skill answer, right here"
          subtitle="These are the repo's real example skills, running in your browser. Pick one, send a request, read the response."
        />

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
          {/* Controls */}
          <div className="glass flex flex-col gap-5 rounded-2xl p-6">
            <div>
              <div className="mb-2 font-mono text-xs uppercase tracking-wider text-mute">skill</div>
              <div className="flex flex-wrap gap-2">
                {DEMO_SKILLS.map((s, i) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => select(i)}
                    className={cn(
                      'cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-sm transition-colors',
                      idx === i
                        ? 'border-brand/40 bg-brand/10 text-brand'
                        : 'border-line text-mute hover:border-brand/40 hover:text-ink',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="demo-input"
                className="mb-2 block font-mono text-xs uppercase tracking-wider text-mute"
              >
                request body
              </label>
              {skill.input === 'none' ? (
                <div className="rounded-lg border border-dashed border-line px-3 py-2.5 font-mono text-sm text-mute">
                  input: none - this skill takes no body
                </div>
              ) : (
                <input
                  id="demo-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && run()}
                  placeholder={skill.placeholder}
                  className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2.5 font-mono text-sm text-ink outline-none transition-colors focus:border-brand/40"
                />
              )}
            </div>

            <button
              type="button"
              onClick={run}
              disabled={running}
              className="group inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-medium text-on-brand transition-all duration-200 hover:brightness-105 active:scale-[0.97] disabled:opacity-60"
            >
              <Play className="h-4 w-4 fill-canvas" />
              {running ? 'Running...' : 'Send request'}
            </button>
          </div>

          {/* Console */}
          <div className="overflow-hidden rounded-2xl border border-line bg-code">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="font-mono text-xs text-brand">POST</span>
              <span className="truncate font-mono text-xs text-mute">/skills/{skill.slug}</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
              <code className="block">
                <span className="block text-ink/75">
                  <span className="text-brand">$ </span>
                  {command}
                </span>
                <span className="mt-3 block min-h-[1.5rem]">
                  {running && <span className="text-mute">...</span>}
                  {output !== null && !running && (
                    <motion.span
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className="text-brand"
                    >
                      {output}
                    </motion.span>
                  )}
                  {output === null && !running && (
                    <span className="text-mute/60">press send to see the response</span>
                  )}
                </span>
              </code>
            </pre>
          </div>
        </div>
      </Container>
    </section>
  );
}
