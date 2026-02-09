import { EmbedBuilder } from "discord.js";
import type { CatResponse, PaletteColor, UserConfig } from "./api-client.js";

export function buildCatEmbed(
  params: CatResponse["params"],
  slug: string | undefined,
  viewUrl: string | undefined,
  imageFilename: string
): EmbedBuilder {
  const lines = [
    `**Pelt:** ${params.peltName}`,
    `**Colour:** ${params.colour}`,
    `**Eye Colour:** ${params.eyeColour}`,
    `**Sprite:** ${params.spriteNumber}`,
    `**Shading:** ${params.shading ? "Yes" : "No"}`,
  ];

  const tortieCount = params.tortie?.length ?? 0;
  lines.push(`**Tortie:** ${params.isTortie ? `Yes (${tortieCount} layer${tortieCount !== 1 ? "s" : ""})` : "No"}`);

  const accCount = params.accessories?.filter(Boolean).length ?? 0;
  lines.push(`**Accessories:** ${accCount}`);

  const scarCount = params.scars?.filter(Boolean).length ?? 0;
  lines.push(`**Scars:** ${scarCount}`);

  if (params.darkForest) {
    lines.push(`**Dark Forest:** Yes`);
  }
  if (params.dead) {
    lines.push(`**StarClan:** Yes`);
  }

  const embed = new EmbedBuilder()
    .setTitle(slug ? `Cat: ${slug}` : "Random Cat")
    .setDescription(lines.join("\n"))
    .setImage(`attachment://${imageFilename}`)
    .setColor(0x7c3aed);

  if (viewUrl) {
    embed.setURL(viewUrl);
    embed.setFooter({ text: "View on BeastyPage" });
  }

  return embed;
}

export function buildPaletteEmbed(
  colors: PaletteColor[],
  customizeUrl: string,
  imageFilename: string
): EmbedBuilder {
  const hexList = colors.map((c) => `\`${c.hex}\` (${c.prevalence}%)`).join("\n");
  return new EmbedBuilder()
    .setTitle("Extracted Palette")
    .setDescription(hexList)
    .setImage(`attachment://${imageFilename}`)
    .setURL(customizeUrl)
    .setFooter({ text: "Customize on BeastyPage" })
    .setColor(0x7c3aed);
}

export function buildConfigEmbed(cfg: UserConfig): EmbedBuilder {
  const lines = [
    `**Accessories:** ${cfg.accessoriesMin}–${cfg.accessoriesMax}`,
    `**Scars:** ${cfg.scarsMin}–${cfg.scarsMax}`,
    `**Torties:** ${cfg.tortiesMin}–${cfg.tortiesMax}`,
    `**Dark Forest:** ${cfg.darkForest ? "Always" : "Random (10%)"}`,
    `**StarClan:** ${cfg.starclan ? "Always" : "Off"}`,
    `**Palettes:** ${cfg.palettes.length > 0 ? cfg.palettes.join(", ") : "None (base colours)"}`,
  ];

  return new EmbedBuilder()
    .setTitle("Your Cat Config")
    .setDescription(lines.join("\n"))
    .setColor(0x7c3aed);
}
