import { Check, Copy, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { AGENT_PROMPT, LINKS } from '../lib/content';
import { Container, Reveal, SectionHeading } from './ui';

export default function QuickStartPrompt() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(AGENT_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, []);

  return (
    <section id="quickstart" className="relative py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="The fast path"
          title="Don't read the docs. Let your agent."
          subtitle="Paste this into Claude Code, Cursor, or any coding agent. It reads the docs, scaffolds the skill, serves it, and hands you a working curl."
        />

        <Reveal>
          <div className="glass mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3">
              <Sparkles className="h-4 w-4 text-brand" />
              <span className="text-sm font-medium text-mute">
                Prompt - paste into your coding agent
              </span>
              <button
                type="button"
                onClick={copy}
                className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-mute transition-colors hover:bg-ink/[0.06] hover:text-ink"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-brand" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <p className="p-5 text-base leading-relaxed text-ink/90 sm:p-6 sm:text-lg">
              Read{' '}
              <a
                href={LINKS.docs}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand underline decoration-brand/30 underline-offset-4 transition-colors hover:decoration-brand"
              >
                https://docs.husk.systems
              </a>{' '}
              and scaffold a HUSK skill in Python that takes a city name on stdin and prints the
              current weather as JSON, then serve it with{' '}
              <code className="rounded-md bg-ink/[0.07] px-1.5 py-0.5 font-mono text-[0.9em] text-brand">
                husk serve
              </code>{' '}
              and show me a working curl.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
