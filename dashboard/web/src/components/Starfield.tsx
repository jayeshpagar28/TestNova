import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Stars drifting toward the viewer. `warp` turns the drift into streaks — the intro's hand-off
 * to the dashboard. Star count scales with screen area so a phone draws far fewer.
 */
export function Starfield({ warp }: { warp: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const warpRef = useRef(warp);
  const reduce = useReducedMotion();
  warpRef.current = warp;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    type Star = { x: number; y: number; z: number; pz: number; hue: number };
    let stars: Star[] = [];
    const spawn = (s: Star, far = true) => {
      s.x = (Math.random() - 0.5) * w * 1.6;
      s.y = (Math.random() - 0.5) * h * 1.6;
      s.z = far ? w : Math.random() * w;
      s.pz = s.z;
      // mostly white, some lilac and electric blue — the dashboard's accents
      s.hue = Math.random();
    };
    const resize = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(320, (w * h) / 5200));
      stars = Array.from({ length: n }, () => {
        const s = { x: 0, y: 0, z: 0, pz: 0, hue: 0 };
        spawn(s, false);
        return s;
      });
    };
    resize();
    window.addEventListener('resize', resize);

    let speed = 1.2;
    let raf = 0;
    const frame = () => {
      speed += ((warpRef.current ? 46 : 1.2) - speed) * (warpRef.current ? 0.06 : 0.1);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      for (const s of stars) {
        s.pz = s.z;
        s.z -= reduce ? 0 : speed;
        if (s.z < 1) {
          spawn(s);
          continue;
        }
        const k = w / 2;
        const x = cx + (s.x / s.z) * k;
        const y = cy + (s.y / s.z) * k;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) {
          spawn(s);
          continue;
        }
        const px = cx + (s.x / s.pz) * k;
        const py = cy + (s.y / s.pz) * k;
        const near = 1 - s.z / w;
        const color = s.hue > 0.86 ? '169,156,255' : s.hue > 0.74 ? '120,165,255' : '235,236,245';
        ctx.strokeStyle = `rgba(${color},${0.25 + near * 0.75})`;
        ctx.lineWidth = 0.4 + near * 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x + 0.01, y);
        ctx.stroke();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reduce]);

  return <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />;
}
