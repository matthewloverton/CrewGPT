// Requre the necessary discord.js classes
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("remove-personality")
  .setDescription("Remove an existing personality")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("Name of the personality.")
      .setRequired(true)
  )
  .setDMPermission(false);

export const execute = async (interaction, state) => {
  const name = interaction.options.getString("name");

  // Check if personality already exists
  const index = state.personalities.findIndex(
    (p) => p.name.toUpperCase() === name.toUpperCase()
  );

  if (index === -1) {
    return await interaction.reply({
      content: process.env.DEL_PERS_ERROR_MSG,
      ephemeral: true,
    });
  }

  state.personalities.splice(index, 1);

  await interaction.reply(
    `${name} has been removed from the personality list.`
  );
};

export default {
  data,
  execute,
};
