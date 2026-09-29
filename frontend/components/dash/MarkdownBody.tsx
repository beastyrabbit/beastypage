"use client";

// Escape HTML special characters to prevent XSS when embedding text in HTML.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Sanitize HTML string: strip script tags, on* attributes, and javascript: URLs.
// Content originates from GitHub Releases API (trusted source) and passes through
// our own markdown-to-HTML converter, so the sanitizer is a defense-in-depth measure.
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?(<\/iframe>|\/?>)/gi, "")
    .replace(/<object[\s\S]*?(<\/object>|\/?>)/gi, "")
    .replace(/<embed[\s\S]*?\/?>|<embed[\s\S]*?<\/embed>/gi, "")
    .replace(/<form[\s\S]*?(<\/form>|\/?>)/gi, "")
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    .replace(/(?:src|href)\s*=\s*"data:[^"]*"/gi, 'src=""')
    .replace(/(?:src|href)\s*=\s*'data:[^']*'/gi, "src=''");
}

function inlineMarkdown(text: string): string {
  // Extract inline code spans first (they should not be processed for bold/italic)
  const codeSpans: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    const idx = codeSpans.length;
    codeSpans.push(
      `<code class="rounded bg-white/10 px-1 py-0.5 text-[0.85em]">${escapeHtml(code)}</code>`,
    );
    return `\uE000CODE${idx}\uE000`;
  });

  // HTML-escape remaining text before applying markdown transformations
  out = escapeHtml(out);

  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(/_(.+?)_/g, "<em>$1</em>");
  // Images — attributes already escaped by escapeHtml above
  out = out.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_m, alt: string, src: string) => {
      const safeSrc = src.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      return `<img src="${escapeHtml(safeSrc)}" alt="${alt}" class="max-w-full rounded" />`;
    },
  );
  // Links — label is already HTML-escaped, escape href. The label excludes
  // "[" and the href allows one level of balanced parentheses, which keeps
  // matching linear (no backtracking across link candidates).
  out = out.replace(
    /\[([^[\]]+)\]\(((?:[^()]|\([^()]*\))+)\)/g,
    (_m, label: string, href: string) => {
      const safeHref = href.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" class="underline text-emerald-400 hover:text-emerald-300">${label}</a>`;
    },
  );

  // Restore code spans (uses private-use U+E000 sentinels to mark placeholders)
  out = out.replace(
    /\uE000CODE(\d+)\uE000/g,
    (_m, idx: string) => codeSpans[Number.parseInt(idx, 10)],
  );

  return out;
}

const ADMONITION_COLORS: Record<string, string> = {
  note: "border-blue-500/40 bg-blue-500/10",
  tip: "border-emerald-500/40 bg-emerald-500/10",
  warning: "border-yellow-500/40 bg-yellow-500/10",
  caution: "border-red-500/40 bg-red-500/10",
  important: "border-purple-500/40 bg-purple-500/10",
};

const HEADING_SIZES = [
  "",
  "text-xl font-bold",
  "text-lg font-bold",
  "text-base font-semibold",
  "text-sm font-semibold",
  "text-sm font-medium",
  "text-xs font-medium",
];

// A parsed block: the HTML to emit (null emits nothing) and the next line index.
interface Block {
  html: string | null;
  next: number;
}

type BlockParser = (lines: string[], i: number) => Block | null;

// Collect consecutive lines from `start` while `test` holds.
function collectWhile(
  lines: string[],
  start: number,
  test: (line: string) => boolean,
): { taken: string[]; next: number } {
  const taken: string[] = [];
  let i = start;
  while (i < lines.length && test(lines[i])) {
    taken.push(lines[i]);
    i++;
  }
  return { taken, next: i };
}

// Fenced code block
function parseFencedCode(lines: string[], i: number): Block | null {
  const line = lines[i];
  if (!line.startsWith("```")) return null;
  const lang = line.slice(3).trim();
  const { taken, next } = collectWhile(
    lines,
    i + 1,
    (l) => !l.startsWith("```"),
  );
  const codeLines = taken.map(escapeHtml);
  // skip closing ``` (guard unclosed blocks)
  const end = next < lines.length ? next + 1 : next;
  const safeLang = lang.replaceAll('"', "&quot;");
  const langAttr = safeLang ? ` data-lang="${safeLang}"` : "";
  return {
    html: `<pre class="rounded-lg bg-black/40 p-3 text-xs overflow-x-auto"><code${langAttr}>${codeLines.join("\n")}</code></pre>`,
    next: end,
  };
}

// GitHub-style admonitions: > [!NOTE], > [!WARNING], etc.
function parseAdmonition(lines: string[], i: number): Block | null {
  const admonitionMatch = /^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]/.exec(
    lines[i],
  );
  if (!admonitionMatch) return null;
  const type = admonitionMatch[1].toLowerCase();
  const { taken, next } = collectWhile(lines, i + 1, (l) => l.startsWith(">"));
  const bodyLines = taken.map((l) => l.replace(/^>\s?/, ""));
  return {
    html: `<div class="border-l-2 ${ADMONITION_COLORS[type] ?? ""} rounded-r px-3 py-2 text-sm my-2"><strong class="capitalize">${type}</strong><br/>${inlineMarkdown(bodyLines.join("<br/>"))}</div>`,
    next,
  };
}

// Blockquote
function parseBlockquote(lines: string[], i: number): Block | null {
  if (!lines[i].startsWith("> ")) return null;
  const { taken, next } = collectWhile(lines, i, (l) => l.startsWith("> "));
  const quoteLines = taken.map((l) => l.slice(2));
  return {
    html: `<blockquote class="border-l-2 border-white/20 pl-3 text-muted-foreground italic my-2">${inlineMarkdown(quoteLines.join("<br/>"))}</blockquote>`,
    next,
  };
}

// Headings
function parseHeading(lines: string[], i: number): Block | null {
  const headingMatch = /^(#{1,6})\s+(.+)/.exec(lines[i]);
  if (!headingMatch) return null;
  const level = headingMatch[1].length;
  return {
    html: `<h${level} class="${HEADING_SIZES[level]} mt-3 mb-1">${inlineMarkdown(headingMatch[2])}</h${level}>`,
    next: i + 1,
  };
}

// Build a list parser for lines whose marker matches `marker`.
function listParser(marker: RegExp, tag: "ul" | "ol", cls: string) {
  return (lines: string[], i: number): Block | null => {
    if (!marker.test(lines[i])) return null;
    const { taken, next } = collectWhile(lines, i, (l) => marker.test(l));
    const items = taken.map(
      (l) => `<li>${inlineMarkdown(l.replace(marker, ""))}</li>`,
    );
    return {
      html: `<${tag} class="${cls}">${items.join("")}</${tag}>`,
      next,
    };
  };
}

// Unordered list
const parseUnorderedList = listParser(
  /^[-*+]\s/,
  "ul",
  "list-disc pl-5 space-y-0.5 my-2",
);

// Ordered list
const parseOrderedList = listParser(
  /^\d+\.\s/,
  "ol",
  "list-decimal pl-5 space-y-0.5 my-2",
);

// Horizontal rule
function parseHorizontalRule(lines: string[], i: number): Block | null {
  if (!/^---+$/.test(lines[i].trim())) return null;
  return { html: '<hr class="border-white/10 my-3" />', next: i + 1 };
}

// Blank line
function parseBlankLine(lines: string[], i: number): Block | null {
  if (lines[i].trim() !== "") return null;
  return { html: null, next: i + 1 };
}

const BLOCK_PARSERS: BlockParser[] = [
  parseFencedCode,
  parseAdmonition,
  parseBlockquote,
  parseHeading,
  parseUnorderedList,
  parseOrderedList,
  parseHorizontalRule,
  parseBlankLine,
];

function parseBlock(lines: string[], i: number): Block {
  for (const parser of BLOCK_PARSERS) {
    const block = parser(lines, i);
    if (block) return block;
  }
  // Paragraph
  return {
    html: `<p class="my-1.5">${inlineMarkdown(lines[i])}</p>`,
    next: i + 1,
  };
}

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const block = parseBlock(lines, i);
    if (block.html !== null) out.push(block.html);
    i = block.next;
  }

  return out.join("\n");
}

interface MarkdownBodyProps {
  content: string;
}

export function MarkdownBody({ content }: Readonly<MarkdownBodyProps>) {
  // Content is sanitized (script tags, on* attrs, javascript: URLs removed)
  // before being set as innerHTML. Source is GitHub Releases API.
  const html = sanitize(markdownToHtml(content));
  return (
    <div
      className="prose-sm max-w-none text-sm leading-relaxed text-foreground/80"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized via sanitize() on line 222
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
