import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import {
  attachBatchSlug,
  attachCatStreamViewSlug,
  cancelBatchCull,
  clearOverlay,
  cullBatchCat,
  ensureCatStreamSession,
  getCatStreamSession,
  getCatStreamSessionByApiKey,
  holdEvolution,
  markBatchCat,
  mergeCatStreamSettings,
  releaseEvolution,
  reportBatchStage,
  revealEvolutionAt,
  setBatchHighlight,
  showBrb,
  showLobby,
  skipEvolutionToBoard,
  toggleTestMode,
  triggerCatStreamBatch,
  triggerCatStreamEvolution,
  triggerCatStreamSpin,
  triggerCatStreamWheel,
  updateCatStreamSettings,
} from "@/server/services/catStream";

const bodySchema = z
  .object({
    operation: z.enum([
      "ensureSession",
      "updateSettings",
      "mergeSettings",
      "triggerSpin",
      "attachViewSlug",
      "triggerWheel",
      "triggerEvolution",
      "triggerBatch",
      "reportBatchStage",
      "markBatchCat",
      "setBatchHighlight",
      "cullBatchCat",
      "cancelBatchCull",
      "holdEvolution",
      "releaseEvolution",
      "revealEvolutionAt",
      "skipEvolutionToBoard",
      "attachBatchSlug",
      "showLobby",
      "showBrb",
      "clearOverlay",
      "toggleTestMode",
    ]),
    settings: z.unknown().optional(),
    params: z.unknown().optional(),
    slots: z.unknown().optional(),
    countdownSeconds: z.number().optional(),
    seq: z.number().optional(),
    slug: z.string().optional(),
    evolution: z.unknown().optional(),
    batch: z.unknown().optional(),
    apiKey: z.string().optional(),
    stageIndex: z.number().optional(),
    awaitingCull: z.boolean().optional(),
    catId: z.string().nullable().optional(),
    kind: z.enum(["potential", "favorite", "spotlight"]).optional(),
    targetElapsedMs: z.number().optional(),
    parkAtElapsedMs: z.number().optional(),
    holdStartedAt: z.number().optional(),
  })
  .superRefine((value, context) => {
    const require = (field: keyof typeof value, message: string) => {
      if (value[field] === undefined)
        context.addIssue({ code: "custom", path: [field], message });
    };
    switch (value.operation) {
      case "updateSettings":
      case "mergeSettings":
        require("settings", "Settings are required");
        break;
      case "triggerSpin":
        require("params", "Spin params are required");
        break;
      case "attachViewSlug":
      case "attachBatchSlug":
        require("seq", "Sequence is required");
        require("slug", "Slug is required");
        break;
      case "triggerEvolution":
        require("evolution", "Evolution is required");
        break;
      case "triggerBatch":
        require("batch", "Batch is required");
        break;
      case "reportBatchStage":
        require("apiKey", "API key is required");
        require("seq", "Sequence is required");
        require("stageIndex", "Stage index is required");
        require("awaitingCull", "Awaiting-cull flag is required");
        break;
      case "markBatchCat":
        require("seq", "Sequence is required");
        require("catId", "Cat id is required");
        break;
      case "setBatchHighlight":
        require("seq", "Sequence is required");
        require("catId", "Cat id is required");
        require("kind", "Highlight kind is required");
        break;
      case "cullBatchCat":
        require("seq", "Sequence is required");
        require("catId", "Cat id is required");
        break;
      case "cancelBatchCull":
      case "holdEvolution":
      case "releaseEvolution":
      case "skipEvolutionToBoard":
        require("seq", "Sequence is required");
        break;
      case "revealEvolutionAt":
        require("seq", "Sequence is required");
        require("targetElapsedMs", "Target elapsed time is required");
        break;
    }
  });
const querySchema = z.object({ key: z.string().optional() });

function unavailable() {
  return NextResponse.json(
    { error: "Not found", code: "not_found" },
    { status: 404 },
  );
}
function resultResponse(value: unknown) {
  return NextResponse.json(value === undefined ? null : value);
}
export async function GET(request: NextRequest) {
  if (dataBackend() !== "postgres") return unavailable();
  try {
    const { key } = parseSearchParams(
      request.nextUrl.searchParams,
      querySchema,
    );
    const result = key
      ? await getCatStreamSessionByApiKey(getDb(), key)
      : await getCatStreamSession(getDb(), await getRequestIdentity());
    return result ? NextResponse.json(result) : NextResponse.json(null);
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load stream overlay",
      "cat stream GET",
    );
  }
}
export async function POST(request: NextRequest) {
  if (dataBackend() !== "postgres") return unavailable();
  try {
    const input = await parseJsonBody(request, bodySchema);
    const db = getDb();
    const identity = await getRequestIdentity();
    switch (input.operation) {
      case "ensureSession":
        return resultResponse(
          await ensureCatStreamSession(db, identity, input.settings),
        );
      case "updateSettings":
        return resultResponse(
          await updateCatStreamSettings(db, identity, input.settings),
        );
      case "mergeSettings":
        return resultResponse(
          await mergeCatStreamSettings(
            db,
            identity,
            (input.settings ?? {}) as Record<string, unknown>,
          ),
        );
      case "triggerSpin":
        return resultResponse(
          await triggerCatStreamSpin(db, identity, {
            params: input.params,
            slots: input.slots,
            countdownSeconds: input.countdownSeconds,
          }),
        );
      case "attachViewSlug":
        return resultResponse(
          await attachCatStreamViewSlug(db, identity, {
            seq: input.seq ?? 0,
            slug: input.slug ?? "",
          }),
        );
      case "triggerWheel":
        return resultResponse(await triggerCatStreamWheel(db, identity));
      case "triggerEvolution":
        return resultResponse(
          await triggerCatStreamEvolution(db, identity, input.evolution),
        );
      case "triggerBatch":
        return resultResponse(
          await triggerCatStreamBatch(db, identity, input.batch),
        );
      case "reportBatchStage":
        return resultResponse(
          await reportBatchStage(db, input.apiKey ?? "", {
            seq: input.seq ?? 0,
            stageIndex: input.stageIndex ?? 0,
            awaitingCull: input.awaitingCull ?? false,
          }),
        );
      case "markBatchCat":
        return resultResponse(
          await markBatchCat(db, identity, {
            seq: input.seq ?? 0,
            catId: input.catId ?? null,
          }),
        );
      case "setBatchHighlight":
        return resultResponse(
          await setBatchHighlight(db, identity, {
            seq: input.seq ?? 0,
            catId: input.catId ?? "",
            kind: input.kind ?? "potential",
          }),
        );
      case "cullBatchCat":
        return resultResponse(
          await cullBatchCat(db, identity, {
            seq: input.seq ?? 0,
            catId: input.catId ?? "",
          }),
        );
      case "cancelBatchCull":
        return resultResponse(
          await cancelBatchCull(db, identity, { seq: input.seq ?? 0 }),
        );
      case "holdEvolution":
        return resultResponse(
          await holdEvolution(db, identity, {
            seq: input.seq ?? 0,
            parkAtElapsedMs: input.parkAtElapsedMs,
          }),
        );
      case "releaseEvolution":
        return resultResponse(
          await releaseEvolution(db, identity, { seq: input.seq ?? 0 }),
        );
      case "revealEvolutionAt":
        return resultResponse(
          await revealEvolutionAt(db, identity, {
            seq: input.seq ?? 0,
            targetElapsedMs: input.targetElapsedMs ?? 0,
          }),
        );
      case "skipEvolutionToBoard":
        return resultResponse(
          await skipEvolutionToBoard(db, identity, { seq: input.seq ?? 0 }),
        );
      case "attachBatchSlug":
        return resultResponse(
          await attachBatchSlug(db, identity, {
            seq: input.seq ?? 0,
            slug: input.slug ?? "",
          }),
        );
      case "showLobby":
        return resultResponse(await showLobby(db, identity));
      case "showBrb":
        return resultResponse(await showBrb(db, identity));
      case "clearOverlay":
        return resultResponse(await clearOverlay(db, identity));
      case "toggleTestMode":
        return resultResponse(await toggleTestMode(db, identity));
    }
  } catch (error) {
    return errorResponse(
      error,
      "Failed to update stream overlay",
      "cat stream POST",
    );
  }
}
