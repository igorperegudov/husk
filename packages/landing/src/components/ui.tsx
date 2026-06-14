import { motion } from 'framer-motion';
import { ArrowUpRight, Check, Copy } from 'lucide-react';
import { type ComponentPropsWithoutRef, type ReactNode, useCallback, useState } from 'react';
import { cn } from '../lib/cn';
import { fadeUp, inView } from '../lib/motion';

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-8', className)}>{children}</div>;
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={inView}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/[0.07] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-brand to-brand-2 shadow-[0_0_10px] shadow-brand" />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'center' | 'left';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-5',
        align === 'center' ? 'items-center text-center' : 'items-start',
      )}
    >
      {eyebrow && (
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Reveal>
      )}
      <Reveal delay={0.05}>
        <h2 className="max-w-3xl text-balance text-4xl font-extrabold tracking-tight sm:text-5xl md:text-[3.5rem] md:leading-[1.05]">
          {title}
        </h2>
      </Reveal>
      {subtitle && (
        <Reveal delay={0.1}>
          <p
            className={cn(
              'max-w-xl text-pretty text-lg leading-relaxed text-mute',
              align === 'center' && 'mx-auto',
            )}
          >
            {subtitle}
          </p>
        </Reveal>
      )}
    </div>
  );
}

type ButtonVariant = 'primary' | 'ghost';

const buttonBase =
  'group inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-semibold transition-all duration-200 active:scale-[0.97]';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-brand to-brand-2 text-on-brand shadow-[0_10px_40px] shadow-brand/30 hover:shadow-brand/50 hover:brightness-105',
  ghost: 'glass text-ink hover:bg-ink/[0.06]',
};

export function LinkButton({
  href,
  variant = 'primary',
  external,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  external?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      className={cn(buttonBase, buttonVariants[variant], className)}
    >
      {children}
    </a>
  );
}

export function CopyCommand({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [command]);

  return (
    <div
      className={cn(
        'glass flex items-center gap-3 rounded-2xl px-5 py-4 font-mono text-sm',
        className,
      )}
    >
      <span className="select-none text-brand">$</span>
      <code className="truncate text-ink/90">{command}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy command'}
        className="ml-auto cursor-pointer rounded-lg p-1.5 text-mute transition-colors hover:bg-ink/[0.06] hover:text-ink"
      >
        {copied ? <Check className="h-4 w-4 text-brand" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function tintLine(line: string, i: number): ReactNode {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) {
    return (
      <span key={i} className="text-mute/70">
        {line}
      </span>
    );
  }
  if (trimmed === '---') {
    return (
      <span key={i} className="text-mute/50">
        {line}
      </span>
    );
  }
  const kv = line.match(/^(\s*-?\s*)([\w$.]+)(:)(.*)$/);
  if (kv) {
    return (
      <span key={i}>
        {kv[1]}
        <span className="text-brand">{kv[2]}</span>
        <span className="text-mute">{kv[3]}</span>
        <span className="text-ink/85">{kv[4]}</span>
      </span>
    );
  }
  return (
    <span key={i} className="text-ink/85">
      {line}
    </span>
  );
}

export function CodeBlock({
  code,
  filename,
  className,
}: {
  code: string;
  filename?: string;
  className?: string;
}) {
  const lines = code.split('\n');
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-line bg-code', className)}>
      <div className="h-0.5 w-full bg-gradient-to-r from-brand to-brand-2 opacity-70" />
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-ink/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        {filename && <span className="ml-2 font-mono text-xs text-mute">{filename}</span>}
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code className="block whitespace-pre">
          {lines.map((line, i) => (
            <span key={i} className="block">
              {tintLine(line, i)}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

export function GlassCard({ className, children, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'glass rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_20px_60px] hover:shadow-brand/10',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { ArrowUpRight };
