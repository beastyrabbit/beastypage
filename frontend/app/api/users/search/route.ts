import { NextResponse } from "next/server";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { searchByUsername } from "@/server/services/users";

export async function GET(request: Request) {
  if (dataBackend() !== "postgres")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(
      await searchByUsername(
        getDb(),
        await getRequestIdentity(),
        new URL(request.url).searchParams.get("prefix") ?? "",
      ),
    );
  } catch (error) {
    return errorResponse(error, "Failed to search users", "users search");
  }
}
