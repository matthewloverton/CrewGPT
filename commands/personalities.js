import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("personalities")
  .setDescription("List the name of all personalities and their prompts.")
  .setDMPermission(false);

export const execute = async (interaction, state) => {
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
    state.isPaused === true
  ) {
    await interaction.reply(process.env.DISABLED_MSG);
    return;
  }

  let embed = new EmbedBuilder()
    .setColor(0x0099ff) // set the color of the embed
    .setTitle(process.env.PERSONALITY_MSG); // set the title of the embed

  // Add personality names and prompts to fields
  for (let i = 0; i < state.personalities.length; i++) {
    let personality = state.personalities[i];
    embed.addFields({
      name: personality.name,
      value: personality.description,
    });
  }
  // Send variable
  interaction.reply({ embeds: [embed] });
};

export default {
  data,
  execute,
};
