import {
  AttachmentBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { generateCat } from "../utils/api-client.js";
import {
  getLegacyCatOptionChoices,
  getTraitChoices,
  getTraitValueChoices,
  type LegacyCatOption,
} from "../utils/cat-catalog.js";
import { buildCatEmbed } from "../utils/embed-builder.js";
import { dataUrlToBase64 } from "../utils/data-url.js";

export async function handleCatCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();

  try {
    const trait = interaction.options.getString("trait") ?? undefined;
    const value = interaction.options.getString("value") ?? undefined;
    if ((trait && value === undefined) || (!trait && value !== undefined)) {
      await interaction.editReply({
        content: "Use `trait` and `value` together for a registry override.",
      });
      return;
    }

    const options = {
      sprite: interaction.options.getInteger("sprite") ?? undefined,
      pelt: interaction.options.getString("pelt") ?? undefined,
      colour: interaction.options.getString("colour") ?? undefined,
      shading: interaction.options.getBoolean("shading") ?? undefined,
      eye_colour: interaction.options.getString("eye_colour") ?? undefined,
      trait,
      value,
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

    if (focused.name === "trait") {
      await interaction.respond(
        getTraitChoices(input, { overrideableOnly: true }),
      );
      return;
    }

    if (focused.name === "value") {
      const traitId = interaction.options.getString("trait") ?? "";
      await interaction.respond(getTraitValueChoices(traitId, input));
      return;
    }

    if (["pelt", "colour", "eye_colour"].includes(focused.name)) {
      await interaction.respond(
        getLegacyCatOptionChoices(focused.name as LegacyCatOption, input),
      );
      return;
    }

    await interaction.respond([]);
  } catch (error) {
    console.error("Autocomplete error:", error);
  }
}
