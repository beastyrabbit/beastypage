import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";

export async function handleHomepageCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("BeastyPage")
    .setURL("https://beastyrabbit.com")
    .setDescription(
      "Pixel cat gacha platform — generators, catdex, palettes & more"
    )
    .setColor(0x7c3aed);

  await interaction.reply({ embeds: [embed] });
}
