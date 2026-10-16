import { NextResponse } from "next/server";
import { z } from "zod";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { perfectCatParams } from "@/server/db/contracts";
import { errorResponse } from "@/server/http";
import { parseJsonBody } from "@/server/request";
import { registerPerfectCats } from "@/server/services/games";
export const dynamic = "force-dynamic";
const schema = z.object({
  cats: z
    .array(z.object({ params: perfectCatParams }))
    .min(1)
    .max(32),
});
const notFound = () =>
  NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
export async function POST(request: Request) {
  if (dataBackend() !== "postgres") return notFound();
  try {
    const body = await parseJsonBody(request, schema);
    return NextResponse.json(await registerPerfectCats(getDb(), body.cats));
  } catch (error) {
    return errorResponse(
      error,
      "Failed to register cats",
      "perfect cats register",
    );
  }
}
