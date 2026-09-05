// @vitest-environment node
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { downloadPublicImage } from "@/lib/public-image-download";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("node:http", () => ({ request: mocks.request }));
afterEach(() => vi.resetAllMocks());

function response(
  statusCode: number,
  headers: Record<string, string>,
  chunks: Buffer[] = [],
) {
  return Object.assign(Readable.from(chunks), { statusCode, headers });
}

it("pins the validated address and validates a redirect before connecting again", async () => {
  mocks.lookup
    .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
    .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
  mocks.request.mockImplementation((_url, options, callback) => {
    const pinned = vi.fn();
    options.lookup("images.example", { all: true }, pinned);
    expect(pinned).toHaveBeenCalledWith(null, [
      { address: "8.8.8.8", family: 4 },
    ]);
    expect(options.agent).toBe(false);
    return Object.assign(new EventEmitter(), {
      end: () =>
        callback(
          response(302, { location: "https://redirect.example/image.png" }),
        ),
    });
  });
  await expect(
    downloadPublicImage("https://images.example/image.png"),
  ).rejects.toThrow("public");
  expect(mocks.lookup).toHaveBeenCalledTimes(2);
  expect(mocks.request).toHaveBeenCalledTimes(1);
});

it("accepts a bounded image stream and rejects a stream exceeding its byte budget", async () => {
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  let chunks = [Buffer.from("fixture")];
  mocks.request.mockImplementation((_url, _options, callback) =>
    Object.assign(new EventEmitter(), {
      end: () =>
        callback(response(200, { "content-type": "image/png" }, chunks)),
    }),
  );
  expect(await downloadPublicImage("https://images.example/image.png")).toEqual(
    Buffer.from("fixture"),
  );
  chunks = [Buffer.alloc(10 * 1024 * 1024), Buffer.from("overflow")];
  await expect(
    downloadPublicImage("https://images.example/image.png"),
  ).rejects.toThrow("10 MB");
});
