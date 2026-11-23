import { Fragment, type ReactNode } from 'react';

/**
 * A small Markdown renderer for the pipeline's output files: headings, paragraphs, lists, tables,
 * code blocks, block quotes, inline code, bold, italic and links. It builds React elements and
 * never sets HTML, so text written by an agent (or copied from the application under test) can
 * never run script in this page. `<br>` inside table cells (the test plans use it) becomes a break.
 */

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))|(<br\s*\/?>)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = key;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(<code key={i++} className="rounded bg-white/[0.07] px-1 py-px font-mono text-[0.92em] text-ink">{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={i++} className="font-medium text-ink">{inline(t.slice(2, -2), i * 100)}</strong>);
    else if (m[3]) out.push(<em key={i++}>{t.slice(1, -1)}</em>);
    else if (m[4]) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const safe = /^https?:\/\//i.test(href ?? '');
      out.push(safe ? <a key={i++} href={href} target="_blank" rel="noreferrer noopener" className="text-lilac underline decoration-lilac/40">{label}</a> : <span key={i++}>{label}</span>);
    } else if (m[5]) out.push(<br key={i++} />);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      blocks.push(<pre key={k++} className="overflow-x-auto rounded-xl border border-line bg-black/30 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">{body.join('\n')}</pre>);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const size = ['text-[19px]', 'text-[16px]', 'text-[14px]', 'text-[13px]', 'text-[12.5px]', 'text-[12px]'][h[1].length - 1];
      blocks.push(<p key={k++} className={`${size} mt-4 font-medium text-ink first:mt-0`}>{inline(h[2])}</p>);
      i += 1;
      continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={k++} className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="bg-white/[0.04] text-ink">
              <tr>{head.map((c, j) => <th key={j} className="whitespace-nowrap border-b border-line px-3 py-2 font-medium">{inline(c)}</th>)}</tr>
            </thead>
            <tbody className="text-ink-2">
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line/60 align-top last:border-0">
                  {head.map((_, j) => <td key={j} className="px-3 py-2">{inline(r[j] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={k++} className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5 text-ink-2`}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</List>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={k++} className="border-l-2 border-lilac/40 pl-3 text-ink-2">{quote.map((q, j) => <Fragment key={j}>{inline(q)}{j < quote.length - 1 && <br />}</Fragment>)}</blockquote>);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={k++} className="border-line" />);
      i += 1;
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*\||\s*([-*+]|\d+\.)\s|>)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    blocks.push(<p key={k++} className="text-ink-2">{inline(para.join(' '))}</p>);
  }
  return <div className="flex flex-col gap-3 text-[12.5px] leading-relaxed">{blocks}</div>;
}

/** CSV as a table (the knowledge base and reports sometimes include one). */
export function CsvTable({ text }: { text: string }) {
  const rows = text.trim().split(/\r?\n/).map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '')));
  const [head = [], ...body] = rows;
  return <Markdown text={[`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n')} />;
}
