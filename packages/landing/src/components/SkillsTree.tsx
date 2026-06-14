import { motion } from 'framer-motion';
import { ArrowRight, Folder } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '../lib/cn';
import { TREE_SKILLS, type TreeSkill } from '../lib/content';
import { Container, Reveal, SectionHeading } from './ui';

interface Row {
  prefix: string;
  name: string;
  isRoot?: boolean;
  endpoint?: TreeSkill;
}

function buildRows(): Row[] {
  const rows: Row[] = [{ prefix: '', name: 'skills/', isRoot: true }];
  TREE_SKILLS.forEach((s, f) => {
    const lastFolder = f === TREE_SKILLS.length - 1;
    rows.push({ prefix: lastFolder ? '└─ ' : '├─ ', name: `${s.folder}/`, endpoint: s });
    s.files.forEach((file, k) => {
      const lastFile = k === s.files.length - 1;
      const cont = lastFolder ? '    ' : '│   ';
      rows.push({ prefix: cont + (lastFile ? '└─ ' : '├─ '), name: file });
    });
  });
  return rows;
}

function ModeTag({ mode }: { mode: string }) {
  const isLlm = mode === 'llm';
  return (
    <span
      className={cn(
        'ml-2 rounded border px-1.5 py-0.5 font-mono text-[10px]',
        isLlm ? 'border-brand/30 bg-brand/10 text-brand' : 'border-line text-mute',
      )}
    >
      {mode}
    </span>
  );
}

const rows = buildRows();

export default function SkillsTree() {
  return (
    <section id="skills" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="A folder of skills"
          title="Every skill is already an endpoint"
          subtitle="Drop skills into one directory. husk discovers each folder and serves it - no routing, no registration, no glue."
        />

        <Reveal>
          <div className="glass mx-auto mt-14 max-w-3xl rounded-2xl p-6 sm:p-8">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
              <Folder className="h-4 w-4 text-brand" />
              your project
            </div>

            <div className="overflow-x-auto">
              <div className="grid min-w-[440px] grid-cols-[auto_auto_1fr] items-center gap-x-4 gap-y-2 sm:gap-x-8">
                {rows.map((r, i) => (
                  <Fragment key={i}>
                    <code className="whitespace-pre font-mono text-sm">
                      <span className="text-mute/60">{r.prefix}</span>
                      <span
                        className={
                          r.endpoint ? 'font-medium text-ink' : r.isRoot ? 'text-ink' : 'text-mute'
                        }
                      >
                        {r.name}
                      </span>
                      {r.endpoint && <ModeTag mode={r.endpoint.mode} />}
                    </code>

                    {r.endpoint ? (
                      <motion.span
                        aria-hidden
                        className="text-brand/70"
                        animate={{ x: [0, 4, 0] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </motion.span>
                    ) : (
                      <span />
                    )}

                    {r.endpoint ? (
                      <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-brand/20 bg-brand/[0.06] px-3 py-1.5 font-mono text-xs">
                        <span className="font-semibold text-brand">{r.endpoint.method}</span>
                        <span className="text-ink/85">/skills/{r.endpoint.slug}</span>
                      </span>
                    ) : (
                      <span />
                    )}
                  </Fragment>
                ))}
              </div>
            </div>

            <p className="mt-6 border-t border-line pt-4 font-mono text-xs text-mute">
              + generated: GET /skills · GET /openapi.json · GET /healthz
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
