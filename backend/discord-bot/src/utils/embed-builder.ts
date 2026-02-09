import { EmbedBuilder } from "discord.js";
import type { CatResponse, PaletteColor, UserConfig } from "./api-client.js";

export function buildCatEmbed(
  _params: CatResponse["params"],
  slug: string | undefined,
  viewUrl: string | undefined,
  imageFilename: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(slug ? `Cat: ${slug}` : "Random Cat")
    .setImage(`attachment://${imageFilename}`)
    .setColor(0x7c3aed);

  if (viewUrl) {
    embed.setURL(viewUrl);
  }

  embed.setFooter({ text: "View on beastyrabbit.com" });

  return embed;
}

export function buildPaletteEmbed(
  colors: PaletteColor[],
  customizeUrl: string,
  imageFilename: string,
  familyColors?: PaletteColor[],
): EmbedBuilder {
  const dominantList = colors.map((c) => `\`${c.hex}\``).join(" ");
  const lines = [`**Dominant:** ${dominantList}`];

  if (familyColors && familyColors.length > 0) {
    const accentList = familyColors.map((c) => `\`${c.hex}\``).join(" ");
    lines.push(`**Accent:** ${accentList}`);
  }

  return new EmbedBuilder()
    .setTitle("Extracted Palette")
    .setDescription(lines.join("\n"))
    .setImage(`attachment://${imageFilename}`)
    .setURL(customizeUrl)
    .setFooter({ text: "Customize on beastyrabbit.com" })
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
