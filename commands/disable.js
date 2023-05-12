// Requre the necessary discord.js classes
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("disable")
  .setDescription("Disable the bot.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export const execute = async (interaction, state) => {
  state.isPaused = true;
  await interaction.reply(process.env.DISABLE_MSG);
};

export default {
  data,
  execute,
};
