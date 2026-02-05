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
    codeSpans.push(`<code class="rounded bg-white/10 px-1 py-0.5 text-[0.85em]">${escapeHtml(code)}</code>`);
    return `\x00CODE${idx}\x00`;
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
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, src: string) => {
    const safeSrc = src.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    return `<img src="${escapeHtml(safeSrc)}" alt="${alt}" class="max-w-full rounded" />`;
  });
  // Links — label is already HTML-escaped, escape href
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
    const safeHref = href.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" class="underline text-emerald-400 hover:text-emerald-300">${label}</a>`;
  });

  // Restore code spans
  out = out.replace(/\x00CODE(\d+)\x00/g, (_m, idx: string) => codeSpans[parseInt(idx, 10)]);

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

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
        i++;
      }
      if (i < lines.length) i++; // skip closing ``` (guard unclosed blocks)
      const safeLang = lang.replace(/"/g, "&quot;");
      out.push(
        `<pre class="rounded-lg bg-black/40 p-3 text-xs overflow-x-auto"><code${safeLang ? ` data-lang="${safeLang}"` : ""}>${codeLines.join("\n")}</code></pre>`,
      );
      continue;
    }

    // GitHub-style admonitions: > [!NOTE], > [!WARNING], etc.
    if (/^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]/.test(line)) {
      const match = line.match(/^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]/);
      const type = match![1].toLowerCase();
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        bodyLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<div class="border-l-2 ${ADMONITION_COLORS[type] ?? ""} rounded-r px-3 py-2 text-sm my-2"><strong class="capitalize">${type}</strong><br/>${inlineMarkdown(bodyLines.join("<br/>"))}</div>`,
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      out.push(
        `<blockquote class="border-l-2 border-white/20 pl-3 text-muted-foreground italic my-2">${inlineMarkdown(quoteLines.join("<br/>"))}</blockquote>`,
      );
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level} class="${HEADING_SIZES[level]} mt-3 mb-1">${inlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(/^[-*+]\s/, ""))}</li>`);
        i++;
      }
      out.push(`<ul class="list-disc pl-5 space-y-0.5 my-2">${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(/^\d+\.\s/, ""))}</li>`);
        i++;
      }
      out.push(`<ol class="list-decimal pl-5 space-y-0.5 my-2">${items.join("")}</ol>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      out.push('<hr class="border-white/10 my-3" />');
      i++;
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    out.push(`<p class="my-1.5">${inlineMarkdown(line)}</p>`);
    i++;
  }

  return out.join("\n");
}

export function MarkdownBody({ content }: { content: string }) {
  // Content is sanitized (script tags, on* attrs, javascript: URLs removed)
  // before being set as innerHTML. Source is GitHub Releases API.
  const html = sanitize(markdownToHtml(content));
  return (
    <div
      className="prose-sm max-w-none text-sm leading-relaxed text-foreground/80"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
