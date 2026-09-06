import { resolve } from "node:path";
import { createServer } from "vite";
export default async function setup() {
  const server = await createServer({
    configFile: resolve(import.meta.dirname, "vite.config.mts"),
  });
  await server.listen();
  process.env.BROWSER_FIXTURE_URL = `${server.resolvedUrls!.local[0]}tests/browser/index.html`;
  return () => server.close();
}
