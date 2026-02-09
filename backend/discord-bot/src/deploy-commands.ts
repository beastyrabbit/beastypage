import {
  REST,
  Routes,
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} from "discord.js";
import { config } from "./config.js";

/** Shared cat-generation options applied to both /gen-discord-kitten and /cat */
function buildCatCommand(name: string, description: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addIntegerOption((option) =>
      option
        .setName("sprite")
        .setDescription("Sprite number")
        .setMinValue(3)
        .setMaxValue(18)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("pelt")
        .setDescription("Pelt pattern")
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("colour")
        .setDescription("Fur colour")
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("shading")
        .setDescription("Enable shading")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("eye_colour")
        .setDescription("Eye colour")
        .setAutocomplete(true)
        .setRequired(false)
    );
}

const genDiscordKittenCommand = buildCatCommand(
  "gen-discord-kitten",
  "Generate a random pixel cat"
);

const catCommand = buildCatCommand(
  "cat",
  "Generate a random pixel cat (alias for /gen-discord-kitten)"
);

const paletteCommand = new SlashCommandBuilder()
  .setName("palette")
  .setDescription("Extract color palette from an image")
  .addStringOption((option) =>
    option
      .setName("image_url")
      .setDescription("Image URL to extract colors from")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("colors")
      .setDescription("Number of colors to extract")
      .setMinValue(2)
      .setMaxValue(12)
      .setRequired(false)
  );

const configCommand = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Manage your cat generation preferences")
  .addSubcommand((sub) =>
    sub.setName("view").setDescription("View your current config")
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Update config fields")
      .addIntegerOption((o) =>
        o.setName("accessories_min").setDescription("Min accessories (0-4)").setMinValue(0).setMaxValue(4)
      )
      .addIntegerOption((o) =>
        o.setName("accessories_max").setDescription("Max accessories (0-4)").setMinValue(0).setMaxValue(4)
      )
      .addIntegerOption((o) =>
        o.setName("scars_min").setDescription("Min scars (0-4)").setMinValue(0).setMaxValue(4)
      )
      .addIntegerOption((o) =>
        o.setName("scars_max").setDescription("Max scars (0-4)").setMinValue(0).setMaxValue(4)
      )
      .addIntegerOption((o) =>
        o.setName("torties_min").setDescription("Min tortie layers (0-4)").setMinValue(0).setMaxValue(4)
      )
      .addIntegerOption((o) =>
        o.setName("torties_max").setDescription("Max tortie layers (0-4)").setMinValue(0).setMaxValue(4)
      )
      .addBooleanOption((o) =>
        o.setName("dark_forest").setDescription("Always Dark Forest?")
      )
      .addBooleanOption((o) =>
        o.setName("starclan").setDescription("Always StarClan (dead)?")
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("palette-add")
      .setDescription("Add a colour palette to your config")
      .addStringOption((o) =>
        o
          .setName("palette")
          .setDescription("Palette to add")
          .setAutocomplete(true)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("palette-remove")
      .setDescription("Remove a colour palette from your config")
      .addStringOption((o) =>
        o
          .setName("palette")
          .setDescription("Palette to remove")
          .setAutocomplete(true)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("reset").setDescription("Reset config to defaults")
  );

const homepageCommand = new SlashCommandBuilder()
  .setName("homepage")
  .setDescription("Get a link to BeastyPage");

const contextMenuCommand = new ContextMenuCommandBuilder()
  .setName("Extract Palette")
  .setType(ApplicationCommandType.Message);

const commands = [
  genDiscordKittenCommand.toJSON(),
  catCommand.toJSON(),
  paletteCommand.toJSON(),
  configCommand.toJSON(),
  homepageCommand.toJSON(),
  contextMenuCommand.toJSON(),
];

const rest = new REST().setToken(config.discordBotToken);

const args = process.argv.slice(2);

async function deployCommands() {
  if (args.includes("--clear-global")) {
    console.log("Clearing all global commands...");
    await rest.put(Routes.applicationCommands(config.discordClientId), {
      body: [],
    });
    console.log("Global commands cleared.");
    return;
  }

  if (args.includes("--clear-guild")) {
    const guildId = config.discordGuildId;
    if (!guildId) {
      console.error("DISCORD_GUILD_ID is required for --clear-guild");
      process.exit(1);
    }
    console.log(`Clearing guild commands for ${guildId}...`);
    await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, guildId),
      { body: [] }
    );
    console.log("Guild commands cleared.");
    return;
  }

  // Default: deploy as global commands
  console.log(`Registering ${commands.length} global application commands...`);
  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: commands,
  });
  console.log("Registered global commands");
}

deployCommands().catch((error) => {
  console.error("Failed to deploy commands:", error);
  process.exit(1);
});
