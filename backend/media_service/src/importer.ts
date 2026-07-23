import { lookup } from "node:dns/promises";
import { open } from "node:fs/promises";
import { basename } from "node:path";
import { Agent, request } from "undici";
import { assertPublicIp } from "./ip.ts";

type RemoteFile = {
	path: string;
	name: string;
	mime?: string;
	size: number;
};

class RemoteImportError extends Error {
	readonly status: number;

	constructor(message: string, status = 422) {
		super(message);
		this.name = "RemoteImportError";
		this.status = status;
	}
}

export function validateRemoteUrl(input: string) {
	const url = new URL(input);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new RemoteImportError("Only HTTP and HTTPS links are supported", 400);
	}
	if (url.username || url.password || url.hash) {
		throw new RemoteImportError(
			"Links cannot include credentials or fragments",
			400,
		);
	}
	const expectedPort = url.protocol === "https:" ? "443" : "80";
	if (url.port && url.port !== expectedPort) {
		throw new RemoteImportError(
			"Remote links must use the standard HTTP or HTTPS port",
			400,
		);
	}
	return url;
}

async function pinnedAgent(hostname: string) {
	let addresses: Array<{ address: string; family: number }>;
	try {
		addresses = await lookup(hostname, { all: true, verbatim: true });
	} catch {
		throw new RemoteImportError("Remote host could not be resolved");
	}
	if (addresses.length === 0)
		throw new RemoteImportError("Remote host has no address");
	try {
		for (const candidate of addresses) assertPublicIp(candidate.address);
	} catch {
		throw new RemoteImportError(
			"Remote URL resolves to a private or reserved address",
			400,
		);
	}
	const selected = addresses[0];
	if (!selected) throw new RemoteImportError("Remote host has no address");
	return new Agent({
		connect: {
			lookup: (_hostname, _options, callback) => {
				callback(null, selected.address, selected.family);
			},
		},
	});
}

function remoteName(url: URL) {
	const raw = basename(url.pathname);
	if (!raw) return "shared-media";
	try {
		return decodeURIComponent(raw).slice(0, 255) || "shared-media";
	} catch {
		return raw.slice(0, 255);
	}
}

export async function downloadRemote(
	input: string,
	destination: string,
	maxBytes: number,
): Promise<RemoteFile> {
	let url = validateRemoteUrl(input);
	for (let redirect = 0; redirect <= 5; redirect += 1) {
		const dispatcher = await pinnedAgent(url.hostname);
		try {
			const response = await request(url, {
				dispatcher,
				method: "GET",
				headers: {
					accept: "image/*,video/*;q=0.9,*/*;q=0.1",
					"user-agent": "BeastyRabbit-Quick-Share/1.0",
				},
				headersTimeout: 15_000,
				bodyTimeout: 60_000,
				signal: AbortSignal.timeout(10 * 60 * 1000),
			});

			if (
				response.statusCode >= 300 &&
				response.statusCode < 400 &&
				response.headers.location
			) {
				await response.body.dump();
				if (redirect === 5)
					throw new RemoteImportError(
						"Remote link redirected too many times",
						400,
					);
				const location = Array.isArray(response.headers.location)
					? response.headers.location[0]
					: response.headers.location;
				if (!location)
					throw new RemoteImportError("Remote redirect had no destination");
				url = validateRemoteUrl(new URL(location, url).toString());
				continue;
			}
			if (response.statusCode < 200 || response.statusCode >= 300) {
				await response.body.dump();
				throw new RemoteImportError(
					`Remote server returned HTTP ${response.statusCode}`,
				);
			}

			const declaredLength = Number(response.headers["content-length"] ?? 0);
			if (declaredLength > maxBytes) {
				await response.body.dump();
				throw new RemoteImportError(
					"Remote file is larger than the current limit",
					413,
				);
			}

			const file = await open(destination, "wx", 0o600);
			let size = 0;
			try {
				for await (const chunk of response.body) {
					size += chunk.byteLength;
					if (size > maxBytes) {
						throw new RemoteImportError(
							"Remote file is larger than the current limit",
							413,
						);
					}
					await file.write(chunk);
				}
			} finally {
				await file.close();
			}
			if (size === 0) throw new RemoteImportError("Remote file was empty");
			const contentType = response.headers["content-type"];
			return {
				path: destination,
				name: remoteName(url),
				mime:
					typeof contentType === "string"
						? contentType.split(";")[0]?.trim().slice(0, 150)
						: undefined,
				size,
			};
		} finally {
			await dispatcher.close();
		}
	}
	throw new RemoteImportError("Remote link redirected too many times", 400);
}
