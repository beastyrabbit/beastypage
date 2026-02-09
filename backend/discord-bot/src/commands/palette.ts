import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { extractPalette, type PaletteResponse } from "../utils/api-client.js";
import { buildPaletteEmbed } from "../utils/embed-builder.js";
import { dataUrlToBase64 } from "../utils/data-url.js";

function buildPaletteReply(result: PaletteResponse) {
  const imageBuffer = Buffer.from(dataUrlToBase64(result.paletteImage), "base64");
  const filename = "palette-swatch.png";
  const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
  const embed = buildPaletteEmbed(result.colors, result.customizeUrl, filename);
  return { embeds: [embed], files: [attachment] };
}

export async function handlePaletteCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();

  try {
    const imageUrl = interaction.options.getString("image_url", true);
    const colors = interaction.options.getInteger("colors") ?? undefined;

    const result = await extractPalette(imageUrl, colors);
    await interaction.editReply(buildPaletteReply(result));
  } catch (error) {
    console.error("Error extracting palette:", error);
    await interaction.editReply({
      content: "Failed to extract palette. Please try again later.",
    }).catch(() => {});
  }
}

export async function handlePaletteContextMenu(
  interaction: MessageContextMenuCommandInteraction
): Promise<void> {
  const message = interaction.targetMessage;

  // Find an image from attachments or embeds
  const imageUrl =
    message.attachments.find((a) => a.contentType?.startsWith("image/"))?.url ??
    message.embeds.find((e) => e.image)?.image?.url ??
    message.embeds.find((e) => e.thumbnail)?.thumbnail?.url;

  if (!imageUrl) {
    await interaction.reply({
      content: "No image found in this message.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  await interaction.deferReply();

  try {
    const result = await extractPalette(imageUrl);
    await interaction.editReply(buildPaletteReply(result));
  } catch (error) {
    console.error("Error extracting palette:", error);
    await interaction.editReply({
      content: "Failed to extract palette. Please try again later.",
    }).catch(() => {});
  }
}
