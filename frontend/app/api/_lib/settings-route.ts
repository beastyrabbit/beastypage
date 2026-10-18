import { type NextRequest, NextResponse } from "next/server";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";
import { ANONYMOUS } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import {
  getSettings,
  type SettingsKind,
  saveSettings,
} from "@/server/services/settings";

const MAX_BODY_BYTES = 512 * 1024;

interface SettingsPayload {
  config?: unknown;
  slug?: unknown;
  editToken?: unknown;
}

interface SettingsRouteOptions<TConfig> {
  serviceName: string;
  kind: SettingsKind;
  parseConfig?: (value: unknown) => TConfig;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function invalidJsonResponse() {
  return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
}

function parseConfig<TConfig>(
  value: unknown,
  parser: ((value: unknown) => TConfig) | undefined,
): TConfig {
  return parser ? parser(value) : (value as TConfig);
}

export function createSettingsRouteHandlers<TConfig = unknown>(
  options: SettingsRouteOptions<TConfig>,
) {
  async function GET(request: NextRequest) {
    const slug = request.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    try {
      const record = await getSettings(getDb(), options.kind, slug);
      if (!record) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({
        slug: record.slug,
        config: record.config,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    } catch (error) {
      return errorResponse(
        error,
        "Failed to load settings",
        `Failed to fetch ${options.serviceName} settings`,
      );
    }
  }

  async function POST(request: NextRequest) {
    let body: unknown;
    try {
      body = JSON.parse(await readRequestBody(request, MAX_BODY_BYTES));
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          { error: "Request body is too large" },
          { status: 413 },
        );
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        return NextResponse.json({ error: "Request aborted" }, { status: 499 });
      }
      console.error(
        `Failed to parse ${options.serviceName} settings payload`,
        error,
      );
      return invalidJsonResponse();
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidJsonResponse();
    }
    const payload = body as SettingsPayload;
    if (!payload.config) {
      return NextResponse.json({ error: "Missing config" }, { status: 400 });
    }

    let config: TConfig;
    try {
      config = parseConfig(payload.config, options.parseConfig);
    } catch {
      return NextResponse.json({ error: "Invalid config" }, { status: 400 });
    }

    try {
      const result = await saveSettings(
        getDb(),
        options.kind,
        {
          config,
          slug: optionalString(payload.slug),
          editToken: optionalString(payload.editToken),
        },
        ANONYMOUS,
      );
      return NextResponse.json(result);
    } catch (error) {
      return errorResponse(
        error,
        "Failed to save settings",
        `Failed to save ${options.serviceName} settings`,
      );
    }
  }

  return { GET, POST };
}
