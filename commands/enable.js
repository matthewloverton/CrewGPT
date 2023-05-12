import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("enable")
  .setDescription("Enable the bot.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export const execute = async (interaction, state) => {
  state.isPaused = false;
  await interaction.reply(process.env.ENABLE_MSG);
};

export default {
  data,
  execute,
};
