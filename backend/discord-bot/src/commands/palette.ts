import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { extractPalette, type PaletteResponse } from "../utils/api-client.js";
import { buildPaletteEmbed } from "../utils/embed-builder.js";
import { dataUrlToBase64 } from "../utils/data-url.js";

const IMAGE_URL_REGEX = /\.(png|jpe?g|gif|webp|bmp|tiff?)(\?|$)/i;
const MAX_PALETTE_IMAGE_BYTES = 5 * 1024 * 1024;
const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::", "::1"]);
const DISCORD_IMAGE_HOST_ALLOWLIST = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
  "media.discordapp.com",
]);

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isPrivateOrReservedIpv4Address(ipAddress: string): boolean {
  // IPv4 loopback / private / link-local / CGNAT / benchmarking / docs / multicast.
  if (/^127\./.test(ipAddress)) return true;
  if (/^10\./.test(ipAddress)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ipAddress)) return true;
  if (/^192\.168\./.test(ipAddress)) return true;
  if (/^169\.254\./.test(ipAddress)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ipAddress)) return true;
  if (/^198\.(1[89])\./.test(ipAddress)) return true;
  if (/^192\.0\.2\./.test(ipAddress)) return true;
  if (/^198\.51\.100\./.test(ipAddress)) return true;
  if (/^203\.0\.113\./.test(ipAddress)) return true;
  if (/^(22[4-9]|23\d|24\d|25[0-5])\./.test(ipAddress)) return true;
  if (ipAddress === "0.0.0.0") return true;
  return false;
}

function isPrivateOrReservedIpv6Address(ipAddress: string): boolean {
  const h = normalizeHostname(ipAddress);

  // IPv6 loopback / link-local / unique-local / unspecified.
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe80:")) return true;
  if (h.startsWith("ff")) return true;
  if (h.startsWith("2001:db8")) return true;
  if (h.startsWith("::ffff:")) return true;

  return false;
}

function isPrivateOrReservedIpAddress(ipAddress: string): boolean {
  const normalized = normalizeHostname(ipAddress);
  const ipVersion = isIP(normalized);

  if (ipVersion === 4) return isPrivateOrReservedIpv4Address(normalized);
  if (ipVersion === 6) return isPrivateOrReservedIpv6Address(normalized);

  return false;
}

async function hostnameResolvesToPublicAddresses(hostname: string): Promise<boolean> {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) return false;
    return records.every((record) => !isPrivateOrReservedIpAddress(record.address));
  } catch {
    return false;
  }
}

function isAllowedContextMenuHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (DISCORD_IMAGE_HOST_ALLOWLIST.has(h)) return true;
  return h.endsWith(".discordapp.com") || h.endsWith(".discordapp.net") || h.endsWith(".discord.com");
}

async function validateImageUrl(
  imageUrl: string,
  options: { requireDiscordHost: boolean }
): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return { ok: false, message: "Invalid image URL." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, message: "Only HTTPS image URLs are supported." };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (isIP(hostname) !== 0) {
    return { ok: false, message: "IP address image URLs are not supported." };
  }

  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return { ok: false, message: "Only public image URLs are allowed." };
  }

  if (options.requireDiscordHost && !isAllowedContextMenuHost(hostname)) {
    return {
      ok: false,
      message: "Only Discord-hosted images are supported for this context menu action.",
    };
  }

  if (!(await hostnameResolvesToPublicAddresses(hostname))) {
    return { ok: false, message: "Image URL host must resolve to public IP addresses." };
  }

  return { ok: true, value: parsed.toString() };
}

type PaletteInteraction = ChatInputCommandInteraction | MessageContextMenuCommandInteraction;

async function safeReply(
  interaction: PaletteInteraction,
  payload: InteractionReplyOptions,
  logMessage: string
): Promise<void> {
  await interaction.reply(payload).catch((replyError) => {
    console.error(logMessage, {
      interactionId: interaction.id,
      replyError,
    });
  });
}

async function safeEditReply(
  interaction: PaletteInteraction,
  payload: InteractionEditReplyOptions,
  logMessage: string
): Promise<void> {
  await interaction.editReply(payload).catch((replyError) => {
    console.error(logMessage, {
      interactionId: interaction.id,
      replyError,
    });
  });
}

async function safeSendFailure(
  interaction: PaletteInteraction,
  content: string,
  logMessage: string
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await safeEditReply(interaction, { content }, logMessage);
    return;
  }

  await safeReply(interaction, { content, ephemeral: true }, logMessage);
}

function buildPaletteReply(result: PaletteResponse) {
  const paletteBase64 = dataUrlToBase64(result.paletteImage);
  const estimatedBytes = Math.ceil((paletteBase64.length * 3) / 4);
  if (estimatedBytes > MAX_PALETTE_IMAGE_BYTES) {
    throw new Error("Palette image payload is too large.");
  }

  const imageBuffer = Buffer.from(paletteBase64, "base64");
  if (imageBuffer.length > MAX_PALETTE_IMAGE_BYTES) {
    throw new Error("Palette image payload is too large.");
  }

  const filename = "palette-grid.png";
  const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
  const embed = buildPaletteEmbed(result.colors, result.customizeUrl, filename, result.familyColors);
  return { embeds: [embed], files: [attachment] };
}

export async function handlePaletteCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const imageUrlValidation = await validateImageUrl(interaction.options.getString("image_url", true), {
    requireDiscordHost: false,
  });
  if (!imageUrlValidation.ok) {
    await safeReply(
      interaction,
      { content: imageUrlValidation.message, ephemeral: true },
      "Failed to send palette command URL validation reply"
    );
    return;
  }

  try {
    await interaction.deferReply();
    const colors = interaction.options.getInteger("colors") ?? undefined;

    const result = await extractPalette(imageUrlValidation.value, colors);
    await interaction.editReply(buildPaletteReply(result));
  } catch (error) {
    console.error("Error extracting palette:", error);
    await safeSendFailure(
      interaction,
      "Failed to extract palette. Please try again later.",
      "Failed to send palette command failure reply"
    );
  }
}

export async function handlePaletteContextMenu(
  interaction: MessageContextMenuCommandInteraction
): Promise<void> {
  const message = interaction.targetMessage;

  const imageAttachment = message.attachments.find((attachment) => {
    if (attachment.contentType?.startsWith("image/")) return true;
    if (attachment.width !== null && attachment.height !== null) return true;
    return IMAGE_URL_REGEX.test(attachment.url);
  });

  // Find an image from attachments or embeds
  const imageUrl =
    imageAttachment?.url ??
    message.embeds.find((e) => e.image)?.image?.url ??
    message.embeds.find((e) => e.thumbnail)?.thumbnail?.url;

  if (!imageUrl) {
    await safeReply(
      interaction,
      {
        content: "No image found in this message.",
        ephemeral: true,
      },
      "Failed to send no-image context menu reply"
    );
    return;
  }

  const imageUrlValidation = await validateImageUrl(imageUrl, { requireDiscordHost: true });
  if (!imageUrlValidation.ok) {
    await safeReply(
      interaction,
      {
        content: imageUrlValidation.message,
        ephemeral: true,
      },
      "Failed to send invalid-image-url context menu reply"
    );
    return;
  }

  try {
    await interaction.deferReply();
    const result = await extractPalette(imageUrlValidation.value);
    await interaction.editReply(buildPaletteReply(result));
  } catch (error) {
    console.error("Error extracting palette:", error);
    await safeSendFailure(
      interaction,
      "Failed to extract palette. Please try again later.",
      "Failed to send context menu failure reply"
    );
  }
}
