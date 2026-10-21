/** Browser-source scenes and their preview harnesses must stay free of analytics UI. */
export function isOverlayRoute(pathname: string): boolean {
  return (
    /^\/single-cat-stream\/obs(?:\/|$)/.test(pathname) ||
    /^\/dev\/obs-[^/]+(?:\/|$)/.test(pathname)
  );
}
