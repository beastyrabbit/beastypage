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
  .addBooleanOption((option) =>
    option
      .setName("tortie")
      .setDescription("Force tortie pattern")
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

deployCommands().catch(console.error);
