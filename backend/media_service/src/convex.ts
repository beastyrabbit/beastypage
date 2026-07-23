import type { Config } from "./config.ts";

export class ConvexControlPlane {
	private readonly config: Config;

	constructor(config: Config) {
		this.config = config;
	}

	async call<T>(
		op: string,
		payload: Record<string, unknown> = {},
		bearerToken?: string,
	): Promise<T> {
		const response = await fetch(
			`${this.config.convexSiteUrl}/quick-share/internal`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-quick-share-internal-token": this.config.internalToken,
					...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
				},
				body: JSON.stringify({ op, ...payload }),
				signal: AbortSignal.timeout(30_000),
			},
		);
		const body = (await response.json().catch(() => ({
			error: "Invalid control-plane response",
		}))) as { error?: string };
		if (!response.ok) {
			const error = new Error(body.error ?? "Control-plane request failed");
			Object.assign(error, { status: response.status });
			throw error;
		}
		return body as T;
	}
}

export function bearerFromHeader(value: string | undefined) {
	if (!value?.startsWith("Bearer ")) return undefined;
	const token = value.slice("Bearer ".length).trim();
	return token || undefined;
}
