import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownBody } from "./MarkdownBody";

const render = (content: string) =>
  renderToStaticMarkup(<MarkdownBody content={content} />);

describe("MarkdownBody links", () => {
  it("keeps balanced parentheses in link destinations", () => {
    expect(
      render("[Wikipedia](https://en.wikipedia.org/wiki/Foo_(bar))"),
    ).toContain('href="https://en.wikipedia.org/wiki/Foo_(bar)"');
  });

  it("blocks schemes split by browser-stripped control characters", () => {
    const html = render("[unsafe](java\tscript:alert(1))");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("java");
  });

  it("preserves relative, issue, HTTP, HTTPS, and mailto links", () => {
    const html = render(
      "[issue](#issue-1) [relative](/issues/123) [http](http://example.test) [https](https://example.test) [mail](mailto:test@example.test)",
    );
    expect(html).toContain('href="#issue-1"');
    expect(html).toContain('href="/issues/123"');
    expect(html).toContain('href="http://example.test"');
    expect(html).toContain('href="https://example.test"');
    expect(html).toContain('href="mailto:test@example.test"');
  });

  it("matches unterminated link candidates in linear time", () => {
    const start = performance.now();
    render("[a](".repeat(20_000));
    render("[".repeat(50_000));
    expect(performance.now() - start).toBeLessThan(200);
  });
});
