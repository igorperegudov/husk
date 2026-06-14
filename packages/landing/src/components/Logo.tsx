import { cn } from '../lib/cn';

/** husk wordmark: a gradient `>_` badge plus a bold name. */
export default function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 font-mono text-sm font-bold text-on-brand shadow-[0_0_20px] shadow-brand/40">
        {'>_'}
      </span>
      <span className="font-mono text-xl font-bold tracking-tight text-ink">husk</span>
    </span>
  );
}
