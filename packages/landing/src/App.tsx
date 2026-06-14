import { MotionConfig } from 'framer-motion';
import Background from './components/Background';
import Demo from './components/Demo';
import Footer from './components/Footer';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import LlmShowcase from './components/LlmShowcase';
import Modes from './components/Modes';
import Nav from './components/Nav';
import QuickStartPrompt from './components/QuickStartPrompt';
import { Features, FinalCta, Runtimes, ValueProps } from './components/Sections';
import SkillsTree from './components/SkillsTree';
import UseCases from './components/UseCases';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-dvh overflow-x-hidden">
        <Background />
        <Nav />
        <main>
          <Hero />
          <UseCases />
          <ValueProps />
          <LlmShowcase />
          <QuickStartPrompt />
          <HowItWorks />
          <SkillsTree />
          <Modes />
          <Demo />
          <Features />
          <Runtimes />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
