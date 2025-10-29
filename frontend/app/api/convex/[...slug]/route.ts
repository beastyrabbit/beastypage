import { NextRequest, NextResponse } from "next/server";

const INTERNAL_CONVEX_URL = (process.env.CONVEX_SELF_HOSTED_URL || "http://convex:3210").replace(/\/$/, "");

async function forward(request: NextRequest, slug: string[]): Promise<NextResponse> {
  const search = request.nextUrl.search ?? "";
  const path = slug.length ? `/${slug.join('/')}` : "/";
  const targetUrl = `${INTERNAL_CONVEX_URL}${path}${search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    const body = await request.arrayBuffer();
    init.body = body;
  }

  const upstream = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: { slug?: string[] } }) {
  return forward(request, context.params.slug ?? []);
}

export async function POST(request: NextRequest, context: { params: { slug?: string[] } }) {
  return forward(request, context.params.slug ?? []);
}

export async function PUT(request: NextRequest, context: { params: { slug?: string[] } }) {
  return forward(request, context.params.slug ?? []);
}

export async function PATCH(request: NextRequest, context: { params: { slug?: string[] } }) {
  return forward(request, context.params.slug ?? []);
}

export async function DELETE(request: NextRequest, context: { params: { slug?: string[] } }) {
  return forward(request, context.params.slug ?? []);
}

export async function OPTIONS(request: NextRequest, context: { params: { slug?: string[] } }) {
  return forward(request, context.params.slug ?? []);
}

export async function HEAD(request: NextRequest, context: { params: { slug?: string[] } }) {
  return forward(request, context.params.slug ?? []);
}
