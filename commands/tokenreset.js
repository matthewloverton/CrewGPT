import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("token-reset")
  .setDescription("Reset the token count.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export const execute = async (interaction, state) => {
  state.tokenCount = 0;
  await interaction.reply(process.env.TOKEN_RESET_MSG);
};

export default {
  data,
  execute,
};
