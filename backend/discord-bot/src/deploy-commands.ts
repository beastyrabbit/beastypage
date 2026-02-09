import {
  REST,
  Routes,
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} from "discord.js";
import { config } from "./config.js";

const catCommand = new SlashCommandBuilder()
  .setName("cat")
  .setDescription("Generate a random pixel cat")
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
  )
  .addIntegerOption((option) =>
    option
      .setName("accessories")
      .setDescription("Accessory slot count")
      .setMinValue(0)
      .setMaxValue(4)
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("scars")
      .setDescription("Scar slot count")
      .setMinValue(0)
      .setMaxValue(3)
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("torties")
      .setDescription("Tortie layer count (0 = none)")
      .setMinValue(0)
      .setMaxValue(4)
      .setRequired(false)
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

const contextMenuCommand = new ContextMenuCommandBuilder()
  .setName("Extract Palette")
  .setType(ApplicationCommandType.Message);

const commands = [
  catCommand.toJSON(),
  paletteCommand.toJSON(),
  contextMenuCommand.toJSON(),
];

const rest = new REST().setToken(config.discordBotToken);

async function deployCommands() {
  console.log(`Registering ${commands.length} application commands...`);

  if (config.discordGuildId) {
    await rest.put(
      Routes.applicationGuildCommands(
        config.discordClientId,
        config.discordGuildId
      ),
      { body: commands }
    );
    console.log(`Registered guild commands for ${config.discordGuildId}`);
  } else {
    await rest.put(Routes.applicationCommands(config.discordClientId), {
      body: commands,
    });
    console.log("Registered global commands");
  }
}

deployCommands().catch((error) => {
  console.error("Failed to deploy commands:", error);
  process.exit(1);
});
