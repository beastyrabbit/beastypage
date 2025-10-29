#!/usr/bin/env node
import { promises as fs } from "fs";
import path from "path";

function stringOrNull(value) {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function numericOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normaliseCardNumber(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.replace(/^#/, "");
}

async function buildPayload(exportDir) {
  const dataDir = path.join(exportDir, "data");
  const catdexRaw = JSON.parse(await fs.readFile(path.join(dataDir, "catdex.json"), "utf8"));
  const collectionRaw = JSON.parse(await fs.readFile(path.join(dataDir, "collection.json"), "utf8"));

  const seasons = Object.entries(catdexRaw.seasons ?? {}).map(([id, info]) => ({
    id,
    seasonName: stringOrNull(info?.season_name) ?? id,
    shortName: stringOrNull(info?.short_name),
    cardBack: stringOrNull(info?.card_back)
  }));

  const rarities = Object.entries(catdexRaw.rarities ?? {}).map(([id, info]) => ({
    id,
    name: stringOrNull(info?.rarity_name) ?? id,
    stars: numericOrNull(info?.stars)
  }));

  const catdexRecords = (catdexRaw.records ?? []).map((record) => {
    const defaultCard = stringOrNull(record?.default_card);
    const customCard = stringOrNull(record?.custom_card);
    const cardNumber = normaliseCardNumber(record?.card_number);

    return {
      id: stringOrNull(record?.id) ?? crypto.randomUUID(),
      catName: stringOrNull(record?.cat_name) ?? "Unnamed",
      twitchUserName: stringOrNull(record?.twitch_user_name) ?? "unknown",
      cardNumber,
      seasonId: stringOrNull(record?.season),
      rarityId: stringOrNull(record?.rarity),
      approved: Boolean(record?.approved),
      defaultCard,
      defaultCardThumb: defaultCard ? `thumbs_${defaultCard}` : null,
      customCard,
      customCardThumb: customCard ? `thumbs_${customCard}` : null,
      created: stringOrNull(record?.created),
      updated: stringOrNull(record?.updated)
    };
  });

  const collectionRecords = (collectionRaw.records ?? []).map((record) => ({
    id: stringOrNull(record?.id) ?? crypto.randomUUID(),
    artistName: stringOrNull(record?.artist_name) ?? "",
    animal: stringOrNull(record?.animal) ?? "",
    link: stringOrNull(record?.link) ?? "",
    blurImage: stringOrNull(record?.blur_img_load),
    previewImage: stringOrNull(record?.preview_img),
    fullImage: stringOrNull(record?.full_img),
    created: stringOrNull(record?.created),
    updated: stringOrNull(record?.updated)
  }));

  return {
    seasons,
    rarities,
    catdexRecords,
    collectionRecords
  };
}

async function main() {
  const exportDir = path.resolve(process.argv[2] ?? "backend/catdex-export-20251022-142634");
  const outputPath = path.resolve(process.argv[3] ?? path.join(exportDir, "catdex-payload.json"));

  const payload = await buildPayload(exportDir);
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote payload to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
