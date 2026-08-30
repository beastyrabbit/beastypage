import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import concurrently from "concurrently";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portlessEnvironment = {
	...process.env,
	PORTLESS_PORT: "1355",
	PORTLESS_HTTPS: "0",
};
const startupTimeoutMs = readPositiveInteger(
	process.env.BEASTYPAGE_DEV_TIMEOUT_MS,
	120_000,
);

class ReadinessError extends Error {
	constructor(message, { retryable = false } = {}) {
		super(message);
		this.name = "ReadinessError";
		this.retryable = retryable;
	}
}

function readPositiveInteger(value, fallback) {
	if (value === undefined) return fallback;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getPortlessUrl(name, { noWorktree = false } = {}) {
	const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
	const args = ["exec", "portless", "get", name];
	if (noWorktree) args.push("--no-worktree");
	const result = spawnSync(executable, args, {
		cwd: repositoryRoot,
		encoding: "utf8",
		env: portlessEnvironment,
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			result.stderr.trim() ||
				`portless get ${name} exited with ${result.status}`,
		);
	}

	const value = result.stdout.trim();
	const url = new URL(value);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`Portless returned an unsupported URL: ${value}`);
	}
	return value.replace(/\/$/, "");
}

function delay(milliseconds, signal) {
	return new Promise((resolveDelay, rejectDelay) => {
		if (signal.aborted) {
			rejectDelay(signal.reason);
			return;
		}

		const timer = setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolveDelay();
		}, milliseconds);
		const abort = () => {
			clearTimeout(timer);
			rejectDelay(signal.reason);
		};
		signal.addEventListener("abort", abort, { once: true });
	});
}

async function fetchReady(url, signal) {
	const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
	try {
		return await fetch(url, {
			cache: "no-store",
			redirect: "manual",
			signal: requestSignal,
		});
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw new ReadinessError(
			error instanceof Error ? error.message : String(error),
			{ retryable: true },
		);
	}
}

function statusError(label, response, retryableStatuses = []) {
	return new ReadinessError(`${label} returned HTTP ${response.status}`, {
		retryable: retryableStatuses.includes(response.status),
	});
}

async function checkFrontend(url, signal) {
	const response = await fetchReady(url, signal);
	if (response.status < 200 || response.status >= 400) {
		throw statusError("Frontend", response, [404, 502, 503, 504]);
	}
}

async function checkRenderer(
	url,
	expectedCatalogHash,
	expectedManifestHash,
	signal,
) {
	const response = await fetchReady(`${url}/health`, signal);
	if (!response.ok) {
		throw statusError("Renderer", response, [404, 502, 503, 504]);
	}

	const health = await response.json();
	if (health.status !== "ok") {
		throw new ReadinessError(`Renderer reported status ${health.status}`);
	}
	if (health.catalogHash !== expectedCatalogHash) {
		throw new ReadinessError(
			`Renderer catalog hash ${health.catalogHash ?? "<missing>"} does not match ${expectedCatalogHash}`,
		);
	}
	if (health.manifestHash !== expectedManifestHash) {
		throw new ReadinessError(
			`Renderer manifest hash ${health.manifestHash ?? "<missing>"} does not match ${expectedManifestHash}`,
		);
	}
}

async function checkMedia(url, signal) {
	const response = await fetchReady(`${url}/health`, signal);
	if (!response.ok) {
		throw statusError("Media service", response, [404, 502, 503, 504]);
	}

	const health = await response.json();
	if (health.status !== "ok") {
		throw new ReadinessError(`Media service reported status ${health.status}`);
	}
	if (health.service !== "quick-share") {
		throw new ReadinessError(
			"Media service returned an unexpected health payload",
		);
	}
}

async function waitForHttp(label, check, signal) {
	let consecutiveSuccesses = 0;
	let lastRetryableError;

	while (!signal.aborted) {
		try {
			await check();
			consecutiveSuccesses += 1;
			if (consecutiveSuccesses >= 2) return;
		} catch (error) {
			consecutiveSuccesses = 0;
			if (!(error instanceof ReadinessError) || !error.retryable) throw error;
			lastRetryableError = error;
		}

		await delay(400, signal);
	}

	throw (
		signal.reason ??
		new Error(
			`${label} did not become ready${lastRetryableError ? `: ${lastRetryableError.message}` : ""}`,
		)
	);
}

function waitForOutput(command, pattern, label, signal) {
	return new Promise((resolveOutput, rejectOutput) => {
		let buffer = "";
		let settled = false;
		let stdoutSubscription;
		let stderrSubscription;

		const finish = (callback, value) => {
			if (settled) return;
			settled = true;
			stdoutSubscription?.unsubscribe();
			stderrSubscription?.unsubscribe();
			signal.removeEventListener("abort", abort);
			callback(value);
		};
		const inspect = (chunk) => {
			buffer = `${buffer}${chunk.toString()}`.slice(-16_384);
			if (pattern.test(buffer)) finish(resolveOutput);
		};
		const abort = () =>
			finish(
				rejectOutput,
				signal.reason ?? new Error(`${label} readiness was cancelled`),
			);

		stdoutSubscription = command.stdout.subscribe(inspect);
		stderrSubscription = command.stderr.subscribe(inspect);
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();
	});
}

function openBrowser(url) {
	if (process.env.BEASTYPAGE_DEV_OPEN === "0") {
		console.log(`[dev] Browser opening disabled; open ${url}`);
		return Promise.resolve();
	}

	let executable;
	let args;
	if (process.platform === "darwin") {
		executable = "open";
		args = [url];
	} else if (process.platform === "win32") {
		executable = "cmd.exe";
		args = ["/d", "/s", "/c", "start", "", url];
	} else {
		executable = "xdg-open";
		args = [url];
	}

	return new Promise((resolveOpen, rejectOpen) => {
		const child = spawn(executable, args, { stdio: "ignore" });
		child.once("error", rejectOpen);
		child.once("close", (code, signal) => {
			if (code === 0) {
				resolveOpen();
				return;
			}
			rejectOpen(
				new Error(
					`${executable} failed with ${code ?? signal ?? "an unknown status"}`,
				),
			);
		});
	});
}

function describeExit(outcome) {
	const events = outcome.events;
	const trigger = events.find((event) => !event.killed) ?? events[0];
	if (!trigger) return "Development services stopped before becoming ready";
	return `${trigger.command.name || trigger.command.command} exited with ${trigger.exitCode}`;
}

function stopAll(commands) {
	for (const command of commands) command.kill("SIGTERM");
}

function reportReady(label, readiness) {
	return readiness.then(() => console.log(`[dev] ${label} ready`));
}

async function run() {
	const frontendUrl = getPortlessUrl("beastypage");
	const rendererUrl = getPortlessUrl("renderer.beastypage", {
		noWorktree: true,
	});
	const mediaUrl = getPortlessUrl("media.beastypage", { noWorktree: true });
	const expectedCatalogHash = (
		await readFile(
			resolve(repositoryRoot, "frontend/public/cat-system/catalog-hash.txt"),
			"utf8",
		)
	).trim();
	const expectedManifestHash = (
		await readFile(
			resolve(
				repositoryRoot,
				"frontend/public/cat-system/render-strategy-manifest-hash.txt",
			),
			"utf8",
		)
	).trim();
	if (!/^[a-f0-9]{64}$/.test(expectedCatalogHash)) {
		throw new Error("The generated frontend catalog hash is invalid");
	}
	if (!/^[a-f0-9]{64}$/.test(expectedManifestHash)) {
		throw new Error("The generated render-strategy manifest hash is invalid");
	}

	console.log("[dev] Starting services with the configured Convex deployment.");
	console.log(
		"[dev] Run `pnpm dev:convex` separately only to sync Convex code.",
	);

	const { commands, result } = concurrently(
		[
			{ command: "pnpm dev:frontend", name: "frontend", prefixColor: "blue" },
			{ command: "pnpm dev:renderer", name: "renderer", prefixColor: "green" },
			{ command: "pnpm dev:media", name: "media", prefixColor: "red" },
			{ command: "pnpm dev:bot", name: "bot", prefixColor: "yellow" },
			{ command: "pnpm dev:palettes", name: "palettes", prefixColor: "cyan" },
		],
		{
			cwd: repositoryRoot,
			killOthersOn: ["failure", "success"],
			killTimeout: 5_000,
			padPrefix: true,
			prefix: "name",
		},
	);

	const completion = result.then(
		(events) => ({ ok: true, events }),
		(events) => ({ ok: false, events }),
	);
	const startupController = new AbortController();
	const commandByName = Object.fromEntries(
		commands.map((command) => [command.name, command]),
	);
	let timeout;

	try {
		console.log(`[dev] Waiting for all services before opening ${frontendUrl}`);
		const readiness = Promise.all([
			reportReady(
				"Frontend",
				waitForHttp(
					"Frontend",
					() => checkFrontend(frontendUrl, startupController.signal),
					startupController.signal,
				),
			),
			reportReady(
				"Renderer",
				waitForHttp(
					"Renderer",
					() =>
						checkRenderer(
							rendererUrl,
							expectedCatalogHash,
							expectedManifestHash,
							startupController.signal,
						),
					startupController.signal,
				),
			),
			reportReady(
				"Media service",
				waitForHttp(
					"Media service",
					() => checkMedia(mediaUrl, startupController.signal),
					startupController.signal,
				),
			),
			reportReady(
				"Discord bot",
				waitForOutput(
					commandByName.bot,
					/Logged in as\s+\S+/,
					"Discord bot",
					startupController.signal,
				),
			),
			reportReady(
				"Palette watcher",
				waitForOutput(
					commandByName.palettes,
					/\[palette-watch\] synced renderer palettes and cat-system contract after startup\b/,
					"Palette watcher",
					startupController.signal,
				),
			),
		]).then(
			() => ({ kind: "ready" }),
			(error) => ({ kind: "readiness-error", error }),
		);
		const stopped = completion.then((outcome) => ({
			kind: "stopped",
			outcome,
		}));
		const timedOut = new Promise((resolveTimeout) => {
			timeout = setTimeout(
				() => resolveTimeout({ kind: "timeout" }),
				startupTimeoutMs,
			);
		});

		const startup = await Promise.race([readiness, stopped, timedOut]);
		clearTimeout(timeout);

		if (startup.kind === "stopped") {
			throw new Error(describeExit(startup.outcome));
		}
		if (startup.kind === "timeout") {
			throw new Error(
				`Development services did not become ready within ${Math.ceil(startupTimeoutMs / 1_000)} seconds`,
			);
		}
		if (startup.kind === "readiness-error") throw startup.error;

		await Promise.all([
			checkFrontend(frontendUrl, startupController.signal),
			checkRenderer(
				rendererUrl,
				expectedCatalogHash,
				expectedManifestHash,
				startupController.signal,
			),
			checkMedia(mediaUrl, startupController.signal),
		]);
		if (commands.some((command) => command.state !== "started")) {
			throw new Error("A development service stopped during final readiness");
		}

		startupController.abort(new Error("Startup checks completed"));
		await openBrowser(frontendUrl);
		console.log(`[dev] Ready: ${frontendUrl}`);
	} catch (error) {
		clearTimeout(timeout);
		startupController.abort(error);
		stopAll(commands);
		await completion;
		throw error;
	}

	const outcome = await completion;
	if (!outcome.ok || outcome.events.some((event) => !event.killed)) {
		process.exitCode = 1;
	}
}

run().catch((error) => {
	console.error(
		`[dev] Startup failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exitCode = 1;
});
