/**
 * Chart colours. Each set passed the dataviz validator against the card surface #1A1B1F
 * (lightness band, chroma floor, colour-blind separation, normal-vision floor, contrast):
 *
 *   status, in stacking order:   ALL PASS — worst adjacent ΔE 7.4 (deutan), legal with the
 *                                2px segment gaps + legend this chart always carries
 *   causes, in petal order:      ALL PASS — worst adjacent ΔE 13.4, including the wrap-around
 *
 * The reference's own colours (muted teal, slate, mauve) failed: slate↔mauve was ΔE 1.5 for a
 * protanope. Keep these orders — the separation was checked for neighbours in exactly this order.
 */
export type Status = 'passed' | 'failed' | 'notrun' | 'blocked';
export type Cause = 'app' | 'script' | 'env' | 'data' | 'known' | 'triage';

export const STATUS: Record<Status, { label: string; color: string }> = {
  passed: { label: 'Passed', color: '#1E9E9A' },
  failed: { label: 'Failed', color: '#D9536F' },
  notrun: { label: 'Not executed', color: '#7B6AE6' },
  blocked: { label: 'Blocked', color: '#B5832F' },
};

/** Bottom-to-top stack order of the execution trend. */
export const STATUS_ORDER: Status[] = ['passed', 'failed', 'notrun', 'blocked'];

export const CAUSES: Record<Cause, { label: string; color: string }> = {
  app: { label: 'App defect', color: '#8B5CF6' },
  script: { label: 'Script issue', color: '#D06F1C' },
  env: { label: 'Environment', color: '#1E9E9A' },
  data: { label: 'Test data', color: '#B5832F' },
  known: { label: 'Known defect', color: '#4F7FE0' },
  triage: { label: 'Needs triage', color: '#D9536F' },
};

/** Petal order around the rose — validated as a closed ring. */
export const CAUSE_ORDER: Cause[] = ['app', 'script', 'env', 'data', 'known', 'triage'];

/** Particle colours for the regression flow (decorative, reference look). */
export const PARTICLES = ['#A99CFF', '#2F7BFF', '#43C065', '#F2A33A', '#E85D9C', '#38C6D9'];

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
