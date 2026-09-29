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

  it("matches unterminated link candidates in linear time", () => {
    const start = performance.now();
    render("[a](".repeat(20_000));
    render("[".repeat(50_000));
    expect(performance.now() - start).toBeLessThan(200);
  });
});
