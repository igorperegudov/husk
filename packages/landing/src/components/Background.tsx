import { motion } from 'framer-motion';

/** Big, vivid gradient washes drifting behind the page (dimmed in light mode). */
export default function Background() {
  return (
    <div aria-hidden className="husk-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-canvas" />

      <motion.div
        className="absolute -top-48 -left-32 h-[640px] w-[640px] rounded-full blur-[140px]"
        style={{ background: 'radial-gradient(circle, rgba(63,224,123,0.28), transparent 68%)' }}
        animate={{ x: [0, 60, 0], y: [0, 30, 0], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -top-24 right-[-10%] h-[560px] w-[560px] rounded-full blur-[150px]"
        style={{ background: 'radial-gradient(circle, rgba(198,255,107,0.18), transparent 68%)' }}
        animate={{ x: [0, -50, 0], y: [0, 40, 0], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
      <motion.div
        className="absolute bottom-[-15%] left-1/3 h-[520px] w-[520px] rounded-full blur-[150px]"
        style={{ background: 'radial-gradient(circle, rgba(41,180,95,0.2), transparent 70%)' }}
        animate={{ x: [0, 40, 0], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
      />

      <div className="absolute inset-0 bg-dotgrid opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
    </div>
  );
}
