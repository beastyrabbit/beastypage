import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  getPaletteCatalog,
  getUserConfig,
  updateUserConfig,
} from "../utils/api-client.js";
import { buildConfigEmbed } from "../utils/embed-builder.js";

export async function handleConfigCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const discordUserId = interaction.user.id;

  switch (sub) {
    case "view":
      return handleView(interaction, discordUserId);
    case "set":
      return handleSet(interaction, discordUserId);
    case "palette-add":
      return handlePaletteAdd(interaction, discordUserId);
    case "palette-remove":
      return handlePaletteRemove(interaction, discordUserId);
    case "reset":
      return handleReset(interaction, discordUserId);
    default:
      await interaction.reply({
        content: `Unknown subcommand: ${sub}`,
        ephemeral: true,
      });
  }
}

async function handleView(
  interaction: ChatInputCommandInteraction,
  discordUserId: string
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const cfg = await getUserConfig(discordUserId);
    const embed = buildConfigEmbed(cfg);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error fetching config:", error);
    await interaction.editReply({
      content: "Failed to fetch config. Please try again later.",
    }).catch(() => {});
  }
}

async function handleSet(
  interaction: ChatInputCommandInteraction,
  discordUserId: string
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const fields: Record<string, unknown> = { discordUserId };

    const intFields = [
      "accessories_min", "accessories_max",
      "scars_min", "scars_max",
      "torties_min", "torties_max",
    ] as const;

    const fieldMap: Record<string, string> = {
      accessories_min: "accessoriesMin",
      accessories_max: "accessoriesMax",
      scars_min: "scarsMin",
      scars_max: "scarsMax",
      torties_min: "tortiesMin",
      torties_max: "tortiesMax",
    };

    for (const name of intFields) {
      const val = interaction.options.getInteger(name);
      if (val !== null) fields[fieldMap[name]] = val;
    }

    const darkForest = interaction.options.getBoolean("dark_forest");
    if (darkForest !== null) fields.darkForest = darkForest;

    const starclan = interaction.options.getBoolean("starclan");
    if (starclan !== null) fields.starclan = starclan;

    // Check if anything was actually provided
    if (Object.keys(fields).length <= 1) {
      await interaction.editReply({
        content: "No options provided. Use `/config view` to see your current settings.",
      });
      return;
    }

    await updateUserConfig(fields);

    // Show updated config
    const cfg = await getUserConfig(discordUserId);
    const embed = buildConfigEmbed(cfg);
    await interaction.editReply({
      content: "Config updated!",
      embeds: [embed],
    });
  } catch (error) {
    console.error("Error updating config:", error);
    await interaction.editReply({
      content: "Failed to update config. Please try again later.",
    }).catch(() => {});
  }
}

async function handlePaletteAdd(
  interaction: ChatInputCommandInteraction,
  discordUserId: string
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const paletteId = interaction.options.getString("palette", true);
    await updateUserConfig({ discordUserId, addPalette: paletteId });

    const cfg = await getUserConfig(discordUserId);
    const embed = buildConfigEmbed(cfg);
    await interaction.editReply({
      content: `Added palette **${paletteId}**.`,
      embeds: [embed],
    });
  } catch (error) {
    console.error("Error adding palette:", error);
    await interaction.editReply({
      content: "Failed to add palette. Please try again later.",
    }).catch(() => {});
  }
}

async function handlePaletteRemove(
  interaction: ChatInputCommandInteraction,
  discordUserId: string
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const paletteId = interaction.options.getString("palette", true);
    await updateUserConfig({ discordUserId, removePalette: paletteId });

    const cfg = await getUserConfig(discordUserId);
    const embed = buildConfigEmbed(cfg);
    await interaction.editReply({
      content: `Removed palette **${paletteId}**.`,
      embeds: [embed],
    });
  } catch (error) {
    console.error("Error removing palette:", error);
    await interaction.editReply({
      content: "Failed to remove palette. Please try again later.",
    }).catch(() => {});
  }
}

async function handleReset(
  interaction: ChatInputCommandInteraction,
  discordUserId: string
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    await updateUserConfig({ discordUserId, reset: true });
    const cfg = await getUserConfig(discordUserId);
    const embed = buildConfigEmbed(cfg);
    await interaction.editReply({
      content: "Config reset to defaults.",
      embeds: [embed],
    });
  } catch (error) {
    console.error("Error resetting config:", error);
    await interaction.editReply({
      content: "Failed to reset config. Please try again later.",
    }).catch(() => {});
  }
}

export async function handleConfigAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  try {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused(true);

    if (focused.name !== "palette") return;

    const input = focused.value.toLowerCase();

    if (sub === "palette-add") {
      const paletteCatalog = await getPaletteCatalog();
      // Show all palettes, filtered by input
      const filtered = paletteCatalog
        .filter(
          (p) =>
            p.id.toLowerCase().includes(input) ||
            p.label.toLowerCase().includes(input)
        )
        .slice(0, 25);

      await interaction.respond(
        filtered.map((p) => ({ name: p.label, value: p.id }))
      );
    } else if (sub === "palette-remove") {
      // Show only the user's active palettes
      try {
        const cfg = await getUserConfig(interaction.user.id);
        const paletteCatalog = await getPaletteCatalog();
        const active = cfg.palettes
          .map((id) => {
            const match = paletteCatalog.find((p) => p.id === id);
            return match ?? { id, label: id };
          })
          .filter(
            (p) =>
              p.id.toLowerCase().includes(input) ||
              p.label.toLowerCase().includes(input)
          )
          .slice(0, 25);

        await interaction.respond(
          active.map((p) => ({ name: p.label, value: p.id }))
        );
      } catch {
        // If config fetch fails, show nothing
        await interaction.respond([]);
      }
    }
  } catch (error) {
    console.error("Config autocomplete error:", error);
  }
}
