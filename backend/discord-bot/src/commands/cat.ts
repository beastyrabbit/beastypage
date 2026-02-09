import {
  AttachmentBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { generateCat } from "../utils/api-client.js";
import { buildCatEmbed } from "../utils/embed-builder.js";

const PELT_NAMES = [
  "SingleColour",
  "TwoColour",
  "Tabby",
  "Marbled",
  "Rosette",
  "Smoke",
  "Ticked",
  "Speckled",
  "Bengal",
  "Mackerel",
  "Classic",
  "Sokoke",
  "Agouti",
  "Singlestripe",
  "Masked",
];

const COLOUR_NAMES = [
  "WHITE",
  "PALEGREY",
  "SILVER",
  "GREY",
  "DARKGREY",
  "GHOST",
  "BLACK",
  "CREAM",
  "PALEGINGER",
  "GOLDEN",
  "GINGER",
  "DARKGINGER",
  "SIENNA",
  "LIGHTBROWN",
  "LILAC",
  "BROWN",
  "GOLDEN-BROWN",
  "DARKBROWN",
  "CHOCOLATE",
];

/** Strip the data URL prefix to get raw base64. */
function dataUrlToBase64(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

export async function handleCatCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();

  try {
    const options = {
      sprite: interaction.options.getInteger("sprite") ?? undefined,
      pelt: interaction.options.getString("pelt") ?? undefined,
      colour: interaction.options.getString("colour") ?? undefined,
      shading: interaction.options.getBoolean("shading") ?? undefined,
      tortie: interaction.options.getBoolean("tortie") ?? undefined,
    };

    const result = await generateCat(options);
    const imageBuffer = Buffer.from(dataUrlToBase64(result.image), "base64");
    const filename = result.slug ? `cat-${result.slug}.png` : "cat.png";
    const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
    const embed = buildCatEmbed(
      result.params,
      result.slug,
      result.viewUrl,
      filename
    );

    await interaction.editReply({ embeds: [embed], files: [attachment] });
  } catch (error) {
    console.error("Error generating cat:", error);
    await interaction.editReply({
      content: "Failed to generate cat. Please try again later.",
    });
  }
}

export async function handleCatAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const input = focused.value.toLowerCase();

  let choices: string[];
  if (focused.name === "pelt") {
    choices = PELT_NAMES;
  } else if (focused.name === "colour") {
    choices = COLOUR_NAMES;
  } else {
    return;
  }

  const filtered = choices
    .filter((c) => c.toLowerCase().includes(input))
    .slice(0, 25);

  await interaction.respond(
    filtered.map((c) => ({ name: c, value: c }))
  );
}
