import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";

const MAX_BYTES = 10 * 1024 * 1024;

export function validateImageUrl(input: string): URL {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
  ) {
    throw new Error("Only standard HTTP and HTTPS image URLs are supported");
  }
  return url;
}

export function assertPublicAddresses(
  addresses: Array<{ address: string; family: number }>,
) {
  if (!addresses.length) throw new Error("Image host has no address");
  for (const { address } of addresses) {
    if (ipaddr.process(address).range() !== "unicast")
      throw new Error("Image host must be public");
  }
}

/** Resolve and pin every connection, including each redirect, under one deadline. */
export async function downloadPublicImage(input: string): Promise<Buffer> {
  const signal = AbortSignal.timeout(15_000);
  let url = validateImageUrl(input);
  for (let redirects = 0; redirects <= 5; redirects++) {
    signal.throwIfAborted();
    let onAbort = () => {};
    const addresses = await Promise.race([
      lookup(url.hostname.replace(/^\[|\]$/g, ""), {
        all: true,
        verbatim: true,
      }),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("Image download timed out"));
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]).finally(() => signal.removeEventListener("abort", onAbort));
    assertPublicAddresses(addresses);
    signal.throwIfAborted();
    const selected = addresses[0]!;
    const response = await new Promise<import("node:http").IncomingMessage>(
      (resolve, reject) => {
        const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
          url,
          {
            signal,
            agent: false,
            lookup: (_host, options, callback) => {
              if (options.all) callback(null, [selected]);
              else callback(null, selected.address, selected.family);
            },
          },
          resolve,
        );
        req.on("error", reject);
        req.end();
      },
    );
    try {
      const status = response.statusCode ?? 500;
      if (status >= 300 && status < 400 && response.headers.location) {
        url = validateImageUrl(new URL(response.headers.location, url).href);
        continue;
      }
      if (status < 200 || status >= 300)
        throw new Error("Image server rejected the request");
      if (
        !response.headers["content-type"]?.startsWith("image/") ||
        Number(response.headers["content-length"] ?? 0) > MAX_BYTES
      )
        throw new Error("Invalid image response");
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of response) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) throw new Error("Image exceeds 10 MB");
        chunks.push(Buffer.from(chunk));
      }
      if (!bytes) throw new Error("Image is empty");
      return Buffer.concat(chunks, bytes);
    } finally {
      response.destroy();
    }
  }
  throw new Error("Too many image redirects");
}
