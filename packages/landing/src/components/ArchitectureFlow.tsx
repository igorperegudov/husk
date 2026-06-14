import { motion, useReducedMotion } from 'framer-motion';
import { Folder } from 'lucide-react';
import { cn } from '../lib/cn';

function Pipe({ delay = 0 }: { delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto h-9 w-px bg-gradient-to-b from-brand/60 to-brand/15">
      {!reduce && (
        <motion.span
          className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-brand shadow-[0_0_12px] shadow-brand"
          animate={{ y: [-4, 32], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeIn', delay }}
        />
      )}
    </div>
  );
}

function TreeLine({
  prefix,
  name,
  folder,
  tag,
}: {
  prefix: string;
  name: string;
  folder?: boolean;
  tag?: 'llm' | 'script';
}) {
  return (
    <div className="flex items-center">
      <span className="whitespace-pre text-mute/50">{prefix}</span>
      <span className={folder ? 'font-medium text-ink' : 'text-mute'}>{name}</span>
      {tag && (
        <span
          className={cn(
            'ml-2 rounded border px-1 text-[10px]',
            tag === 'llm' ? 'border-brand/30 bg-brand/10 text-brand' : 'border-line text-mute',
          )}
        >
          {tag}
        </span>
      )}
    </div>
  );
}

interface Endpoint {
  method: string;
  path: string;
  tag?: string;
}

const endpoints: Endpoint[] = [
  { method: 'POST', path: '/skills/assistant', tag: 'llm' },
  { method: 'POST', path: '/skills/uppercase', tag: 'script' },
  { method: 'GET', path: '/openapi.json' },
];

/** A skills folder tree -> husk -> HTTP fan-out, with requests flowing down the pipes. */
export default function ArchitectureFlow() {
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Folder tree of skills */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass rounded-2xl p-5"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Folder className="h-4 w-4 text-brand" />
          skills/
        </div>
        <div className="mt-3 space-y-1 font-mono text-xs leading-relaxed">
          <TreeLine prefix="├─ " name="assistant/" folder tag="llm" />
          <TreeLine prefix="│  └─ " name="SKILL.md" />
          <TreeLine prefix="└─ " name="uppercase/" folder tag="script" />
          <TreeLine prefix="   ├─ " name="SKILL.md" />
          <TreeLine prefix="   └─ " name="upper.sh" />
        </div>
      </motion.div>

      <Pipe />

      {/* husk node */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        className="relative mx-auto w-fit rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/15 to-brand-2/5 px-8 py-4 text-center"
      >
        {!reduce && (
          <motion.div
            className="absolute inset-0 -z-10 rounded-2xl"
            style={{ boxShadow: '0 0 50px rgba(63,224,123,0.35)' }}
            animate={{ opacity: [0.4, 0.85, 0.4] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <div className="font-mono text-xl font-bold text-gradient">husk serve</div>
        <div className="mt-0.5 text-xs text-mute">one Bun process</div>
      </motion.div>

      <Pipe delay={0.3} />

      {/* HTTP fan-out - one endpoint per skill */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
        }}
        className="space-y-2"
      >
        {endpoints.map((e) => (
          <motion.div
            key={e.path}
            variants={{ hidden: { opacity: 0, x: 16 }, show: { opacity: 1, x: 0 } }}
            className="flex items-center gap-3 rounded-xl border border-line bg-panel/60 px-4 py-2.5 font-mono text-sm"
          >
            <span className="w-10 shrink-0 text-xs font-semibold text-brand">{e.method}</span>
            <span className="text-ink/85">{e.path}</span>
            {e.tag && (
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-mute">
                {e.tag}
              </span>
            )}
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px] shadow-brand" />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
