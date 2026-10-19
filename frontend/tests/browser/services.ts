import type { ReactNode } from "react";

export const SignInButton = ({ children }: { children: ReactNode }) => children;
export const usePathname = () => "/streamer/host";
export const useRouter = () => ({ replace: () => {}, push: () => {} });
export const useUser = () => ({
  user: { username: "Test account", imageUrl: null, update: async () => {} },
});
export const useClerk = () => ({
  openSignIn: () => {},
  signOut: async () => {},
});
const getToken = async () => null;
export const useAuth = () => {
  const params = new URL(location.href).searchParams;
  return {
    isLoaded: true,
    isSignedIn: params.get("view") !== "host" || params.get("signedIn") === "1",
    getToken,
  };
};

const artwork = {
  id: "fixture-art",
  artist_name: "Test artist",
  animal: "Cat",
  link: "https://artist.example",
  preview_img: "/sprites/fademask.png",
  full_img: "/sprites/fademask.png",
  blur_img: null,
  blur_img_storage_id: null,
  preview_img_storage_id: null,
  full_img_storage_id: null,
  preview_img_width: null,
  preview_img_height: null,
  full_img_width: null,
  full_img_height: null,
  focusX: 50,
  focusY: 50,
  created: 1,
  updated: 1,
};
const catdexCard = {
  id: "fixture-cat",
  twitch_user_name: "Test artist",
  cat_name: "Keyboard cat",
  card_number: "1",
  approved: true,
  default_card: null,
  default_card_storage_id: null,
  default_card_url: "/sprites/fademask.png",
  default_card_width: null,
  default_card_height: null,
  default_card_thumb: null,
  default_card_thumb_storage_id: null,
  default_card_thumb_url: "/sprites/fademask.png",
  default_card_thumb_width: null,
  default_card_thumb_height: null,
  custom_card: null,
  custom_card_storage_id: null,
  custom_card_url: null,
  custom_card_width: null,
  custom_card_height: null,
  custom_card_thumb: null,
  custom_card_thumb_storage_id: null,
  custom_card_thumb_url: null,
  custom_card_thumb_width: null,
  custom_card_thumb_height: null,
  season: "Fixture season",
  seasonRaw: null,
  seasonShort: "FX",
  rarity: "Common",
  rarityRaw: null,
  rarityStars: 1,
  created: 1,
  updated: 1,
};
const viewer = {
  id: "fixture-user",
  username: "Test account",
  role: "user",
  created: 1,
};

const seasons = [
  {
    id: "fixture-season",
    season_name: "Fixture season",
    short_name: "FX",
    card_back: null,
    card_back_storage_id: null,
    card_back_url: null,
    card_back_width: null,
    card_back_height: null,
    created: 1,
    updated: 1,
  },
];
const rarities = [
  {
    id: "fixture-rarity",
    rarity_name: "Common",
    stars: 1,
    chance_percent: 100,
    created: 1,
    updated: 1,
  },
];

function fixtureResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function catdexResponse(url: URL) {
  if (!new URL(location.href).searchParams.has("detailRegression")) {
    return fixtureResponse({
      results: [catdexCard],
      nextCursor: "fixture-next",
    });
  }
  const portrait = "/tests/browser/catdex-card.svg";
  const cards = Array.from({ length: 69 }, (_, index) => ({
    ...catdexCard,
    id: `detail-cat-${index + 1}`,
    cat_name: `Detail cat ${index + 1}`,
    card_number: String(index + 1),
    updated: 69 - index,
    default_card_url: portrait,
    default_card_thumb_url: portrait,
    custom_card_url: "/sprites/fademask.png",
  }));
  const hasCursor = url.searchParams.has("cursor");
  return fixtureResponse({
    results: hasCursor ? cards.slice(48) : cards.slice(0, 48),
    nextCursor: hasCursor ? null : "detail-next",
  });
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  let inputUrl: string;
  if (typeof input === "string") inputUrl = input;
  else if (input instanceof Request) inputUrl = input.url;
  else inputUrl = input.href;
  const url = new URL(inputUrl, location.origin);
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
  if (url.pathname === "/api/pixelator") return nativeFetch(input, init);
  if (url.pathname === "/api/collection") {
    return fixtureResponse({
      results: [artwork],
      nextCursor: "fixture-next",
    });
  }
  if (url.pathname === "/api/catdex") {
    return catdexResponse(url);
  }
  if (url.pathname === "/api/seasons") return fixtureResponse(seasons);
  if (url.pathname === "/api/rarities") return fixtureResponse(rarities);
  if (url.pathname === "/api/catdex/pending") return fixtureResponse(false);
  if (url.pathname === "/api/users/viewer") return fixtureResponse(viewer);
  if (url.pathname === "/api/user-variants") return fixtureResponse([]);
  if (url.pathname === "/api/ancestry/check-slug") {
    return fixtureResponse({ exists: false, hasPassword: false });
  }
  if (
    url.pathname === "/api/stream/sessions" ||
    url.pathname === "/api/cat-stream"
  ) {
    return fixtureResponse(null);
  }
  if (init?.method === "POST" || init?.method === "PATCH") {
    return fixtureResponse({ remaining: false });
  }
  return fixtureResponse({}, 404);
};
