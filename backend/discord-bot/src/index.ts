import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";
import { handleCatCommand, handleCatAutocomplete } from "./commands/cat.js";
import {
  handlePaletteCommand,
  handlePaletteContextMenu,
} from "./commands/palette.js";

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case "cat":
          await handleCatCommand(interaction);
          break;
        case "palette":
          await handlePaletteCommand(interaction);
          break;
        default:
          console.warn(`Unknown command: ${interaction.commandName}`);
      }
    } else if (interaction.isAutocomplete()) {
      if (interaction.commandName === "cat") {
        await handleCatAutocomplete(interaction);
      }
    } else if (interaction.isMessageContextMenuCommand()) {
      if (interaction.commandName === "Extract Palette") {
        await handlePaletteContextMenu(interaction);
      }
    }
  } catch (error) {
    console.error("Unhandled interaction error:", error);
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Something went wrong. Please try again.",
          ephemeral: true,
        });
      }
    } catch {
      // Best-effort — interaction may have expired
    }
  }
});

client.login(config.discordBotToken).catch((error) => {
  console.error("Failed to login to Discord:", error);
  process.exit(1);
});
