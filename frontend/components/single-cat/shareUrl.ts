import { catDataToLegacyPersistence } from "@/lib/cat-system";
import {
  buildSharePayload,
  type CatState,
} from "../stream-control/obs/spinSupport";

type SharePayload = ReturnType<typeof buildSharePayload>;
type CatStateRef = { current: CatState | null };

interface ShareContext {
  stateRef: CatStateRef;
  state: CatState;
  payload: SharePayload;
  shareSlug: string | null;
  legacyEncoded: string | null;
  origin: string;
}

interface ShareServices {
  encode: (payload: SharePayload) => string;
  createShare: (
    payload: SharePayload,
  ) => Promise<{ slug: string } | null | undefined>;
  createMapper: (args: {
    catData: ReturnType<typeof catDataToLegacyPersistence>;
    catName?: string;
    creatorName?: string;
  }) => Promise<{
    id: string;
    slug?: string;
    shareToken?: string;
    editToken?: string;
  } | null>;
}

export function ensureLegacyShareEncoding(
  existing: string | null | undefined,
  payload: SharePayload,
  encode: ShareServices["encode"],
): string | null {
  const current = existing ?? null;
  if (current) return current;
  try {
    return encode(payload);
  } catch (err) {
    console.warn("Failed to encode share payload", err);
    return current;
  }
}

function withOrigin(origin: string, path: string): string {
  return origin ? `${origin}${path}` : path;
}

async function persistShareMapper(
  { stateRef, state, payload, shareSlug, legacyEncoded, origin }: ShareContext,
  createMapper: ShareServices["createMapper"],
  setShareLink: (url: string) => void,
): Promise<string | null> {
  try {
    const result = await createMapper({
      catData: catDataToLegacyPersistence(
        shareSlug ? { ...payload, shareSlug } : payload,
      ),
      catName: state.catName ?? undefined,
      creatorName: state.creatorName ?? undefined,
    });
    if (result) {
      const shareToken = result.shareToken ?? result.slug ?? result.id;
      const url = withOrigin(origin, `/view/${shareToken}`);
      stateRef.current = {
        ...state,
        profileId: result.id,
        mapperSlug: shareToken,
        editToken: result.editToken ?? state.editToken ?? null,
        legacyEncoded,
        shareUrl: url,
        catShareSlug: shareSlug ?? state.catShareSlug ?? null,
      };
      setShareLink(url);
      return url;
    }
  } catch (err) {
    console.warn("Failed to persist share payload to PostgreSQL", err);
  }
  return null;
}

async function buildFallbackShareUrl(
  context: ShareContext,
  createShare: ShareServices["createShare"],
  setShareLink: (url: string) => void,
  setError: (message: string) => void,
): Promise<string | null> {
  const { stateRef, state, payload, legacyEncoded, origin } = context;
  let shareSlug = context.shareSlug;
  if (!shareSlug) {
    const shareRecord = await createShare({
      params: payload.params,
      accessorySlots: payload.accessorySlots,
      scarSlots: payload.scarSlots,
      tortieSlots: payload.tortieSlots,
      counts: payload.counts,
    });
    if (shareRecord?.slug) {
      shareSlug = shareRecord.slug;
      if (stateRef.current) {
        stateRef.current = { ...stateRef.current, catShareSlug: shareSlug };
      }
    }
  }

  if (shareSlug) {
    const url = withOrigin(origin, `/visual-builder?share=${shareSlug}`);
    if (stateRef.current) {
      stateRef.current = {
        ...stateRef.current,
        catShareSlug: shareSlug,
        shareUrl: url,
        legacyEncoded: stateRef.current.legacyEncoded ?? legacyEncoded ?? null,
      };
    }
    setShareLink(url);
    return url;
  }

  if (legacyEncoded) {
    const url = withOrigin(origin, `/view?cat=${legacyEncoded}`);
    stateRef.current = { ...state, legacyEncoded, shareUrl: url };
    setShareLink(url);
    return url;
  }

  setError("Unable to build share link right now.");
  return null;
}

export async function buildCatShareUrl(
  stateRef: CatStateRef,
  services: ShareServices,
  setShareLink: (url: string) => void,
  setError: (message: string) => void,
): Promise<string | null> {
  const state = stateRef.current;
  if (!state) return null;
  if (state.shareUrl) return state.shareUrl;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareSlug = state.catShareSlug ?? null;
  const slugCandidate = state.mapperSlug ?? state.profileId ?? null;
  if (slugCandidate) {
    const url = withOrigin(origin, `/view/${slugCandidate}`);
    stateRef.current = { ...state, shareUrl: url };
    setShareLink(url);
    return url;
  }

  const payload = buildSharePayload(state);
  const legacyEncoded = ensureLegacyShareEncoding(
    state.legacyEncoded,
    payload,
    services.encode,
  );
  const context: ShareContext = {
    stateRef,
    state,
    payload,
    shareSlug,
    legacyEncoded,
    origin,
  };
  const mapperUrl = await persistShareMapper(
    context,
    services.createMapper,
    setShareLink,
  );
  if (mapperUrl) return mapperUrl;
  return buildFallbackShareUrl(
    context,
    services.createShare,
    setShareLink,
    setError,
  );
}
