import {
  AttachmentBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { generateCat } from "../utils/api-client.js";
import { buildCatEmbed } from "../utils/embed-builder.js";
import { dataUrlToBase64 } from "../utils/data-url.js";

const PELT_CHOICES = [
  ...[
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
  ].map((value) => ({ name: value, value })),
  { name: "Fine Bengal", value: "bengal-rosettes" },
  { name: "Clouded rings", value: "clouded-leopard" },
  { name: "Ocelot chains", value: "ocelot-chains" },
  { name: "Serval spots", value: "serval-spots" },
  { name: "Snow rosettes", value: "snow-leopard" },
  { name: "Tiger bars", value: "tiger-stripes" },
  { name: "King cheetah", value: "king-cheetah" },
  { name: "Lynx fleck", value: "lynx-fleck" },
  { name: "Marble lace", value: "marble-swirl" },
  { name: "Brindle bars", value: "brindle" },
  { name: "Jaguar mosaic", value: "jaguar-mosaic" },
  { name: "Cheetah dots", value: "cheetah-dots" },
  { name: "Fishing cat", value: "fishing-cat" },
  { name: "Toyger braids", value: "toyger-braids" },
  { name: "Sandcat bars", value: "sandcat-bars" },
  { name: "Classic bullseye", value: "classic-bullseye" },
  { name: "Ridgeback", value: "ridgeback" },
  { name: "Masked mantle", value: "masked-mantle" },
  { name: "Ghost stripes", value: "ghost-stripes" },
  { name: "Split marble", value: "split-marble" },
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

const EYE_COLOURS = [
  "YELLOW",
  "AMBER",
  "HAZEL",
  "PALEGREEN",
  "GREEN",
  "BLUE",
  "DARKBLUE",
  "GREY",
  "CYAN",
  "EMERALD",
  "HEATHERBLUE",
  "SUNLITICE",
  "COPPER",
  "SAGE",
  "COBALT",
  "PALEBLUE",
  "PALEYELLOW",
  "GOLD",
  "GREENYELLOW",
  "BRONZE",
  "SILVER",
];

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
      eye_colour: interaction.options.getString("eye_colour") ?? undefined,
      discord_user_id: interaction.user.id,
      discord_username: interaction.user.displayName,
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
    }).catch(() => {});
  }
}

export async function handleCatAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  try {
    const focused = interaction.options.getFocused(true);
    const input = focused.value.toLowerCase();

    let choices: { name: string; value: string }[];
    if (focused.name === "pelt") {
      choices = PELT_CHOICES;
    } else if (focused.name === "colour") {
      choices = COLOUR_NAMES.map((value) => ({ name: value, value }));
    } else if (focused.name === "eye_colour") {
      choices = EYE_COLOURS.map((value) => ({ name: value, value }));
    } else {
      return;
    }

    const filtered = choices
      .filter(
        (choice) =>
          choice.name.toLowerCase().includes(input) ||
          choice.value.toLowerCase().includes(input),
      )
      .slice(0, 25);

    await interaction.respond(filtered);
  } catch (error) {
    console.error("Autocomplete error:", error);
  }
}
