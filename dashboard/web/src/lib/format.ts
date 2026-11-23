export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

export const signedPct = (n: number, digits = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}%`;

export const int = (n: number) => Math.round(n).toLocaleString('en-IN');

export function duration(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

export const shortDate = (d: Date) => dateFmt.format(d);
export const time = (d: Date) => timeFmt.format(d);
export const dateTime = (d: Date) => `${dateFmt.format(d)} ${d.getFullYear()}, ${timeFmt.format(d)}`;

/** A short span to the second: 8.2s, 2m 05s, 1h 04m. */
export function clock(ms: number) {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
}

const secondsFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const timeOfDay = (ms: number) => secondsFmt.format(ms);
export const dateTimeMs = (ms: number) => dateTime(new Date(ms));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 05-Nov-2026, the date format of TestNova's test case and defect sheets. */
export function dmy(value: string | number | null | undefined) {
  if (value == null || value === '') return '';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
