import { EmbedBuilder } from "discord.js";
import type { CatResponse, PaletteColor } from "./api-client.js";

export function buildCatEmbed(
  params: CatResponse["params"],
  slug: string | undefined,
  viewUrl: string | undefined,
  imageFilename: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(slug ? `Cat: ${slug}` : "Random Cat")
    .setDescription(
      [
        `**Pelt:** ${params.peltName}`,
        `**Colour:** ${params.colour}`,
        `**Sprite:** ${params.spriteNumber}`,
        `**Shading:** ${params.shading ? "Yes" : "No"}`,
        `**Tortie:** ${params.isTortie ? "Yes" : "No"}`,
      ].join("\n")
    )
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
