import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadRemote, validateRemoteUrl } from "../src/importer.ts";

const network = vi.hoisted(() => ({
	lookup: vi.fn(),
	request: vi.fn(),
	close: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("undici", () => ({
	request: network.request,
	Agent: class {
		close = network.close;
	},
}));

function response(
	statusCode = 200,
	headers: Record<string, string | string[]> = {},
	chunks = [Buffer.from("image")],
) {
	return {
		statusCode,
		headers,
		body: {
			dump: vi.fn().mockResolvedValue(undefined),
			async *[Symbol.asyncIterator]() {
				yield* chunks;
			},
		},
	};
}

describe("remote URL validation", () => {
	it("allows standard HTTP and HTTPS ports", () => {
		expect(validateRemoteUrl("http://example.com:80/image.png").port).toBe("");
		expect(validateRemoteUrl("https://example.com:443/image.png").port).toBe(
			"",
		);
	});

	it("rejects nonstandard ports and credentials", () => {
		expect(() =>
			validateRemoteUrl("http://example.com:6379/image.png"),
		).toThrow("standard HTTP or HTTPS port");
		expect(() =>
			validateRemoteUrl("https://user:pass@example.com/image.png"),
		).toThrow("credentials");
	});
});

describe("remote downloads", () => {
	let directory: string;
	let destination: string;

	beforeEach(async () => {
		vi.resetAllMocks();
		network.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
		network.close.mockResolvedValue(undefined);
		directory = await mkdtemp(join(tmpdir(), "media-import-test-"));
		destination = join(directory, "download");
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it("follows relative redirects, revalidates DNS and returns the final name and MIME", async () => {
		const redirected = response(302, {
			location: ["/final%20image.png", "/ignored"],
		});
		network.request.mockResolvedValueOnce(redirected).mockResolvedValueOnce(
			response(200, {
				"content-type": " image/png ; charset=utf-8",
				"content-length": "5",
			}),
		);
		await expect(
			downloadRemote("https://example.com/start", destination, 5),
		).resolves.toEqual({
			path: destination,
			name: "final image.png",
			mime: "image/png",
			size: 5,
		});
		expect(await readFile(destination, "utf8")).toBe("image");
		expect((await stat(destination)).mode & 0o777).toBe(0o600);
		expect(redirected.body.dump).toHaveBeenCalledOnce();
		expect(network.lookup).toHaveBeenCalledTimes(2);
		expect(network.close).toHaveBeenCalledTimes(2);
		expect(network.request.mock.calls[1]?.[0].pathname).toBe(
			"/final%20image.png",
		);
	});

	it("rejects a redirect whose DNS includes a private address before making another request", async () => {
		network.request.mockResolvedValue(
			response(302, { location: "https://other.example.com/image" }),
		);
		network.lookup
			.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
			.mockResolvedValueOnce([
				{ address: "93.184.216.34", family: 4 },
				{ address: "127.0.0.1", family: 4 },
			]);
		await expect(
			downloadRemote("https://example.com/start", destination, 20),
		).rejects.toMatchObject({ status: 400 });
		expect(network.request).toHaveBeenCalledOnce();
		expect(network.close).toHaveBeenCalledOnce();
	});

	it("limits redirects to five and closes every dispatcher", async () => {
		const redirected = response(302, { location: "/again" });
		network.request.mockResolvedValue(redirected);
		await expect(
			downloadRemote("https://example.com/start", destination, 20),
		).rejects.toThrow("too many times");
		expect(network.request).toHaveBeenCalledTimes(6);
		expect(redirected.body.dump).toHaveBeenCalledTimes(6);
		expect(network.close).toHaveBeenCalledTimes(6);
	});

	it.each([
		{
			name: "HTTP error",
			reply: response(503),
			message: "HTTP 503",
			status: 422,
		},
		{
			name: "declared size",
			reply: response(200, { "content-length": "21" }),
			message: "larger",
			status: 413,
		},
		{
			name: "missing redirect location",
			reply: response(302, { location: [] }),
			message: "no destination",
			status: 422,
		},
		{
			name: "unsafe redirect",
			reply: response(302, { location: "file:///image" }),
			message: "HTTP and HTTPS",
			status: 400,
		},
	])(
		"rejects $name without creating a file",
		async ({ reply, message, status }) => {
			network.request.mockResolvedValue(reply);
			await expect(
				downloadRemote("https://example.com/image", destination, 20),
			).rejects.toMatchObject({
				message: expect.stringContaining(message),
				status,
			});
			expect(reply.body.dump).toHaveBeenCalledOnce();
			expect(network.close).toHaveBeenCalledOnce();
			await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
		},
	);

	it("enforces the streamed size even when the declared size is smaller", async () => {
		network.request.mockResolvedValue(
			response(200, { "content-length": "2" }, [
				Buffer.from("one"),
				Buffer.from("two"),
			]),
		);
		await expect(
			downloadRemote("https://example.com/image", destination, 5),
		).rejects.toMatchObject({ status: 413 });
		expect(await readFile(destination, "utf8")).toBe("one");
		expect(network.close).toHaveBeenCalledOnce();
	});

	it("rejects an empty response and closes its dispatcher", async () => {
		network.request.mockResolvedValue(response(200, {}, []));
		await expect(
			downloadRemote("https://example.com/image", destination, 5),
		).rejects.toThrow("empty");
		expect(network.close).toHaveBeenCalledOnce();
	});

	it("does not overwrite an existing destination", async () => {
		await writeFile(destination, "original");
		network.request.mockResolvedValue(response());
		await expect(
			downloadRemote("https://example.com/image", destination, 5),
		).rejects.toMatchObject({ code: "EEXIST" });
		expect(await readFile(destination, "utf8")).toBe("original");
		expect(network.close).toHaveBeenCalledOnce();
	});
});
