// Requre the necessary discord.js classes
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("clear-messages")
  .setDescription("Add a new personality to the bot.")
  .addNumberOption((option) =>
    option
      .setName("amount")
      .setDescription("Number of messages to clear")
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export const execute = async (interaction, state) => {
  const amount = interaction.options.getNumber("amount");

  await interaction.channel
    .bulkDelete(amount)
    .then((messages) => {
      interaction.reply({
        content: `Cleared ${messages.size} messages.`,
        ephemeral: true,
      });
    })
    .catch(console.error);
};

export default {
  data,
  execute,
};
