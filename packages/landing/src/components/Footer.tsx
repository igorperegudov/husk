import { LINKS } from '../lib/content';
import Logo from './Logo';
import { Container } from './ui';

const columns = [
  {
    heading: 'Product',
    links: [
      { label: 'Docs', href: LINKS.docs },
      { label: 'Quickstart', href: `${LINKS.docs}/quickstart` },
      { label: 'CLI', href: `${LINKS.docs}/cli` },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'GitHub', href: LINKS.github },
      { label: 'npm', href: LINKS.npm },
      { label: 'X / @elisymlabs', href: LINKS.x },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative border-t border-line py-14">
      <Container>
        <div className="flex flex-col justify-between gap-10 sm:flex-row">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-mute">
              HTTP Universal Skill Kernel. The shell that wraps your script and publishes it.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            {columns.map((col) => (
              <div key={col.heading}>
                <div className="font-mono text-xs uppercase tracking-wider text-mute">
                  {col.heading}
                </div>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-sm text-mute transition-colors hover:text-ink"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-mute sm:flex-row">
          <span>MIT licensed</span>
          <span>
            Built by{' '}
            <a
              href={LINKS.org}
              target="_blank"
              rel="noreferrer noopener"
              className="text-mute underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              elisymlabs
            </a>
          </span>
        </div>
      </Container>
    </footer>
  );
}
