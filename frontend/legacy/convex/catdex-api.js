import { convex, uploadFile } from "./client.js";

function formatSeasonShort(seasonRaw) {
  if (!seasonRaw) return "Unknown";
  const lower = seasonRaw.toLowerCase();
  if (lower === "pending season") return "Pending";
  const parts = seasonRaw.split("_");
  if (parts.length > 1) return parts[1];
  if (lower.startsWith("season ")) {
    const suffix = seasonRaw.slice(7).trim();
    return suffix ? `S ${suffix}` : "Season";
  }
  return seasonRaw;
}

async function hydrateCat(record) {
  const defaultUrl = record.default_card_storage_id
    ? convex.storage.getUrl(record.default_card_storage_id)
    : null;
  const customUrl = record.custom_card_storage_id
    ? convex.storage.getUrl(record.custom_card_storage_id)
    : null;
  return {
    ...record,
    default_card_url: defaultUrl,
    custom_card_url: customUrl,
    defaultImage: defaultUrl,
    customImage: customUrl,
    image: defaultUrl || customUrl,
    season: record.season ?? "Unknown",
    seasonShort: record.seasonShort ?? formatSeasonShort(record.season ?? ""),
    seasonRaw: record.seasonRaw ?? record.season ?? null,
    rarity: record.rarity ?? "Unknown",
    rarityLabel: record.rarity ?? "Unknown",
    rarityStars: record.rarityStars ?? null,
    rarityRaw: record.rarityRaw ?? null
  };
}

async function listCats({ page = 1, perPage = 200, includePending = false } = {}) {
  const args = {};
  if (!includePending) args.approved = true;
  const all = await convex.query("catdex:list", args);
  const hydrated = await Promise.all(all.map(hydrateCat));
  const totalItems = hydrated.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const offset = (page - 1) * perPage;
  const items = hydrated.slice(offset, offset + perPage);
  return { page, perPage, totalItems, totalPages, items };
}

async function createCat(formData) {
  const season = formData.get("season");
  const rarity = formData.get("rarity");
  const catName = formData.get("cat_name");
  const owner = formData.get("twitch_user_name");
  const defaultCard = formData.get("default_card");
  const customCard = formData.get("custom_card");
  const cardNumber = formData.get("card_number");

  if (!(defaultCard instanceof File)) {
    throw new Error("default_card file is required");
  }
  if (typeof season !== "string" || typeof rarity !== "string" || typeof catName !== "string" || typeof owner !== "string") {
    throw new Error("Missing required fields");
  }

  const defaultStorageId = await uploadFile(defaultCard);
  let customStorageId = undefined;
  if (customCard instanceof File && customCard.size > 0) {
    customStorageId = await uploadFile(customCard);
  }

  const result = await convex.mutation("catdex:create", {
    twitchUserName: owner.toLowerCase(),
    catName: String(catName || "").toLowerCase(),
    seasonId: season,
    rarityId: rarity,
    ...(cardNumber ? { cardNumber: String(cardNumber) } : {}),
    defaultCard: {
      storageId: defaultStorageId,
      fileName: defaultCard.name
    },
    ...(customStorageId
      ? {
          customCard: {
            storageId: customStorageId,
            fileName: customCard.name
          }
        }
      : {})
  });
  return hydrateCat(result);
}

async function pendingCount() {
  return convex.query("catdex:pendingCount", {});
}

async function seasons() {
  return convex.query("seasons:list", {});
}

async function rarities() {
  return convex.query("rarities:list", {});
}

export function createCatdexAPI() {
  return {
    async list(params) {
      return listCats(params);
    },
    async create(formData) {
      return createCat(formData);
    },
    async pendingCount() {
      return pendingCount();
    },
    async seasons() {
      return seasons();
    },
    async rarities() {
      return rarities();
    }
  };
}

export function createFilesAPI() {
  return {
    url(_collection, _id, _filename, storageId) {
      if (storageId) return convex.storage.getUrl(storageId);
      return null;
    }
  };
}
