// Minimal Markdown → React renderer for advisor replies. Builds elements directly
// (no innerHTML), so model output can't inject markup.
import { useState } from 'react';

function inline(text, keyBase) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${i++}`;
    if (t.startsWith('**')) parts.push(<strong key={key} className="font-semibold text-white">{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) parts.push(<code key={key} className="rounded bg-slate-800 px-1 py-0.5 text-[0.85em]">{t.slice(1, -1)}</code>);
    else parts.push(<em key={key}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <button
        className="absolute right-2 top-2 rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
        onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs"><code>{code}</code></pre>
    </div>
  );
}

export default function Markdown({ content }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push(<CodeBlock key={blocks.length} code={body.join('\n')} />);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const size = h[1].length <= 2 ? 'text-base' : 'text-sm';
      blocks.push(<p key={blocks.length} className={`${size} font-bold text-white`}>{inline(h[2], blocks.length)}</p>);
      i++;
      continue;
    }

    const listMatch = (l) => l.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)/);
    if (listMatch(line)) {
      const ordered = Boolean(listMatch(line)[1]);
      const items = [];
      while (i < lines.length && listMatch(lines[i])) items.push(listMatch(lines[i++])[2]);
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={blocks.length} className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
          {items.map((it, j) => <li key={j}>{inline(it, `${blocks.length}-${j}`)}</li>)}
        </Tag>
      );
      continue;
    }

    if (!line.trim()) { i++; continue; }

    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !/^#{1,4}\s/.test(lines[i]) && !listMatch(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push(<p key={blocks.length}>{inline(para.join(' '), blocks.length)}</p>);
  }

  return <div className="space-y-3 text-sm leading-relaxed text-slate-200">{blocks}</div>;
}
