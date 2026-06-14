import { motion } from 'framer-motion';
import { HERO, INSTALL, LINKS } from '../lib/content';
import { fadeUp, stagger } from '../lib/motion';
import ArchitectureFlow from './ArchitectureFlow';
import { GitHubIcon } from './icons';
import { ArrowUpRight, Container, CopyCommand, Eyebrow, LinkButton } from './ui';

const proof = ['LLM-native', 'Agent Skills standard', 'Any language'];

export default function Hero() {
  return (
    <section id="top" className="relative pt-36 pb-20 sm:pt-44 sm:pb-28">
      <Container>
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div
            variants={stagger(0.09, 0.05)}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-7"
          >
            <motion.div variants={fadeUp}>
              <Eyebrow>{HERO.eyebrow}</Eyebrow>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-balance text-6xl font-extrabold leading-[0.98] tracking-tight sm:text-7xl md:text-8xl"
            >
              Turn a skill
              <br />
              into <span className="text-gradient text-glow">an API.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="max-w-xl text-pretty text-xl leading-relaxed text-mute"
            >
              {HERO.subtitle}
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
              <LinkButton href={LINKS.docs} external>
                Read the docs
                <ArrowUpRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </LinkButton>
              <LinkButton href={LINKS.github} variant="ghost" external>
                <GitHubIcon className="h-5 w-5" />
                View on GitHub
              </LinkButton>
            </motion.div>

            <motion.div variants={fadeUp}>
              <CopyCommand command={INSTALL} className="max-w-md" />
            </motion.div>

            <motion.ul
              variants={fadeUp}
              className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-mute"
            >
              {proof.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-brand to-brand-2" />
                  {p}
                </li>
              ))}
            </motion.ul>
          </motion.div>

          <div className="lg:pl-6">
            <ArchitectureFlow />
          </div>
        </div>
      </Container>
    </section>
  );
}
