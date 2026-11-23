import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { useTheme } from '../lib/theme';

const SIZE = 240;

/**
 * The reference's "Spot Trading volume" orb: a soft disc, a jagged waveform ring that keeps
 * moving, a zig-zag starburst and a glowing sphere. `energy` raises the ring's amplitude and
 * speed — the regression flow turns it up while a run is in progress.
 */
export function Orb({ energy = 1 }: { energy?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const energyRef = useRef(energy);
  const reduce = useReducedMotion();
  const theme = useTheme(); // redraws a still (reduced-motion) orb when the theme changes
  energyRef.current = energy;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = SIZE * dpr;
    el.height = SIZE * dpr;
    ctx.scale(dpr, dpr);
    const c = SIZE / 2;
    let raf = 0;
    let e = energyRef.current;

    const frame = (ms: number) => {
      const t = reduce ? 0 : ms / 1000;
      // ease toward the target energy so a run starting or ending doesn't jump
      e += (energyRef.current - e) * 0.04;
      ctx.clearRect(0, 0, SIZE, SIZE);

      // light theme only: a pale violet disc and violet spikes; dark keeps its original colours
      const light = document.documentElement.dataset.theme === 'light';

      // soft disc with a faint rim
      const disc = ctx.createRadialGradient(c, c, 20, c, c, 112);
      disc.addColorStop(0, light ? 'rgba(108,92,231,0.16)' : 'rgba(60,62,78,0.55)');
      disc.addColorStop(0.7, light ? 'rgba(108,92,231,0.08)' : 'rgba(38,39,48,0.55)');
      disc.addColorStop(1, light ? 'rgba(108,92,231,0.02)' : 'rgba(32,33,40,0.2)');
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(c, c, 112, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = light ? 'rgba(20,22,30,0.08)' : 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // waveform ring
      const amp = 1 + (e - 1) * 0.9;
      const speed = 1 + (e - 1) * 1.2;
      ctx.beginPath();
      for (let i = 0; i <= 180; i += 1) {
        const a = (i / 180) * Math.PI * 2;
        const r =
          47 +
          amp * (4 * Math.sin(7 * a + t * 1.3 * speed) + 2.6 * Math.sin(13 * a - t * 2.1 * speed) + 2.2 * Math.sin(31 * a + t * 3.7 * speed));
        const x = c + r * Math.cos(a);
        const y = c + r * Math.sin(a);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = light ? 'rgba(108,92,231,0.85)' : 'rgba(169,156,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = 'rgba(140,120,255,0.6)';
      ctx.shadowBlur = 6;
      ctx.stroke();

      // zig-zag starburst
      ctx.beginPath();
      const spikes = 72;
      for (let i = 0; i <= spikes * 2; i += 1) {
        const a = (i / (spikes * 2)) * Math.PI * 2 + t * 0.15;
        const r = i % 2 ? 31 : 36 + 1.6 * Math.sin(9 * a + t * 2 * speed) * amp;
        const x = c + r * Math.cos(a);
        const y = c + r * Math.sin(a);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = light ? 'rgba(108,92,231,0.7)' : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 0.9;
      ctx.shadowBlur = 0;
      ctx.stroke();

      // sphere
      const pulse = 1 + Math.sin(t * 2.2 * speed) * 0.03 * amp;
      const sr = 25 * pulse;
      const sphere = ctx.createRadialGradient(c - 8, c - 9, 2, c, c, sr);
      sphere.addColorStop(0, '#ffffff');
      sphere.addColorStop(0.35, '#e4e6ff');
      sphere.addColorStop(0.8, '#9aa2f5');
      sphere.addColorStop(1, '#6f74e3');
      ctx.fillStyle = sphere;
      ctx.shadowColor = 'rgba(160,170,255,0.9)';
      ctx.shadowBlur = 26 * pulse;
      ctx.beginPath();
      ctx.arc(c, c, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduce, theme]);

  return <canvas ref={canvas} style={{ width: SIZE, height: SIZE }} aria-hidden />;
}

export const ORB_SIZE = SIZE;
