import * as Sentry from "@sentry/node";
import { scrubTelemetry } from "./privacy.ts";

export function initMonitoring(
	environment: NodeJS.ProcessEnv = process.env,
	sdk: Pick<typeof Sentry, "init"> = Sentry,
	transport?: Sentry.NodeOptions["transport"],
): boolean {
	const dsn = environment.GLITCHTIP_DSN;
	if (!dsn) return false;

	sdk.init({
		dsn,
		environment: environment.GLITCHTIP_ENVIRONMENT ?? "development",
		release: `beastypage@${environment.APP_VERSION ?? "dev"}`,
		initialScope: { tags: { service: "media" } },
		// SDK v11 replaces sendDefaultPii: false with explicit collection controls.
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpBodies: [],
			httpHeaders: {
				deny: ["authorization", "proxy-authorization", "cookie", "set-cookie"],
			},
			stackFrameVariables: false,
			databaseQueryData: false,
			queues: false,
			graphQL: { document: false, variables: false },
			genAI: { inputs: false, outputs: false },
		},
		tracesSampleRate: 0.05,
		// GlitchTip accepts Sentry transaction envelopes, rather than streamed spans.
		traceLifecycle: "static",
		beforeSend: (event) => scrubTelemetry(event),
		beforeBreadcrumb: (breadcrumb) => scrubTelemetry(breadcrumb),
		beforeSendTransaction: (event) => scrubTelemetry(event),
		...(transport ? { transport } : {}),
	});
	return true;
}
