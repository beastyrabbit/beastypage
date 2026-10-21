import "./unhandled-rejection.js";
import { captureException, flush } from "@sentry/node";
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
} from "discord.js";
import { config } from "./config.js";
import { handleCatCommand, handleCatAutocomplete } from "./commands/cat.js";
import {
  handlePaletteCommand,
  handlePaletteContextMenu,
} from "./commands/palette.js";
import {
  handleConfigCommand,
  handleConfigAutocomplete,
} from "./commands/config.js";
import { handleHomepageCommand } from "./commands/homepage.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.on(Events.Error, (error) => {
  captureException(error);
  console.error("Discord client error:", error);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await client.destroy();
  } finally {
    await flush(2000);
  }
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

async function handleChatInputCommand(interaction: ChatInputCommandInteraction) {
  switch (interaction.commandName) {
    case "gen-discord-kitten":
    case "cat":
      await handleCatCommand(interaction);
      break;
    case "palette":
      await handlePaletteCommand(interaction);
      break;
    case "config":
      await handleConfigCommand(interaction);
      break;
    case "homepage":
      await handleHomepageCommand(interaction);
      break;
    default:
      console.warn(`Unknown command: ${interaction.commandName}`);
  }
}

async function handleAutocomplete(interaction: AutocompleteInteraction) {
  if (interaction.commandName === "gen-discord-kitten" || interaction.commandName === "cat") {
    await handleCatAutocomplete(interaction);
  } else if (interaction.commandName === "config") {
    await handleConfigAutocomplete(interaction);
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction);
    } else if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    } else if (interaction.isMessageContextMenuCommand()) {
      if (interaction.commandName === "Extract Palette") {
        await handlePaletteContextMenu(interaction);
      }
    }
  } catch (error) {
    captureException(error);
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

await client.login(config.discordBotToken).catch(async (error) => {
  captureException(error);
  console.error("Failed to login to Discord:", error);
  await flush(2000);
  process.exit(1);
});
