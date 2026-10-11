import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";
import { getServerConvexUrl } from "@/lib/convexUrl";

const MAX_BODY_BYTES = 512 * 1024;

interface SettingsPayload {
  config?: unknown;
  slug?: unknown;
  editToken?: unknown;
}

interface SettingsRecord {
  slug: string;
  config: unknown;
  createdAt: number;
  updatedAt: number;
}

interface SettingsSaveResult {
  slug: string;
  id: unknown;
  updated: boolean;
  editToken?: string;
}

interface SettingsRouteOptions<TConfig> {
  serviceName: string;
  parseConfig?: (value: unknown) => TConfig;
  get: (
    convex: ConvexHttpClient,
    slug: string,
  ) => Promise<SettingsRecord | null>;
  save: (
    convex: ConvexHttpClient,
    args: {
      config: TConfig;
      slug?: string;
      editToken?: string;
    },
  ) => Promise<SettingsSaveResult>;
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

    const convexUrl = getServerConvexUrl();
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    }

    try {
      const convex = new ConvexHttpClient(convexUrl);
      const record = await options.get(convex, slug);
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
      console.error(`Failed to fetch ${options.serviceName} settings`, error);
      return NextResponse.json(
        { error: "Failed to load settings" },
        { status: 500 },
      );
    }
  }

  async function POST(request: NextRequest) {
    const convexUrl = getServerConvexUrl();
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex URL not configured" },
        { status: 500 },
      );
    }

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
      const convex = new ConvexHttpClient(convexUrl);
      const result = await options.save(convex, {
        config,
        slug: optionalString(payload.slug),
        editToken: optionalString(payload.editToken),
      });
      return NextResponse.json({
        slug: result.slug,
        id: result.id,
        updated: result.updated,
        editToken: result.editToken,
      });
    } catch (error) {
      console.error(`Failed to save ${options.serviceName} settings`, error);
      return NextResponse.json(
        { error: "Failed to save settings" },
        { status: 500 },
      );
    }
  }

  return { GET, POST };
}
