"use client";

// Sanitize HTML string: strip script tags, on* attributes, and javascript: URLs.
// Content originates from GitHub Releases API (trusted source) and passes through
// our own markdown-to-HTML converter, so the sanitizer is a defense-in-depth measure.
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, "")
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
}

function inlineMarkdown(text: string): string {
  let out = text;
  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(/_(.+?)_/g, "<em>$1</em>");
  // Inline code
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 text-[0.85em]">$1</code>');
  // Images — escape content before embedding
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, src: string) => {
    const safeAlt = alt.replace(/"/g, "&quot;");
    const safeSrc = src.replace(/"/g, "&quot;");
    return `<img src="${safeSrc}" alt="${safeAlt}" class="max-w-full rounded" />`;
  });
  // Links — escape content before embedding
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
    const safeHref = href.replace(/"/g, "&quot;");
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="underline text-emerald-400 hover:text-emerald-300">${label}</a>`;
  });
  return out;
}

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
      i++; // skip closing ```
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
      const colorMap: Record<string, string> = {
        note: "border-blue-500/40 bg-blue-500/10",
        tip: "border-emerald-500/40 bg-emerald-500/10",
        warning: "border-yellow-500/40 bg-yellow-500/10",
        caution: "border-red-500/40 bg-red-500/10",
        important: "border-purple-500/40 bg-purple-500/10",
      };
      out.push(
        `<div class="border-l-2 ${colorMap[type] ?? ""} rounded-r px-3 py-2 text-sm my-2"><strong class="capitalize">${type}</strong><br/>${inlineMarkdown(bodyLines.join("<br/>"))}</div>`,
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
      const sizes = ["", "text-xl font-bold", "text-lg font-bold", "text-base font-semibold", "text-sm font-semibold", "text-sm font-medium", "text-xs font-medium"];
      out.push(`<h${level} class="${sizes[level]} mt-3 mb-1">${inlineMarkdown(headingMatch[2])}</h${level}>`);
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
