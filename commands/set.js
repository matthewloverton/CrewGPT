// Requre the necessary discord.js classes
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("set-personality")
  .setDescription("Set your personality")
  .addStringOption((option) =>
    option
      .setName("personality")
      .setDescription("Which personality? check /personalities for options.")
      .setAutocomplete(true)
      .setRequired(true)
  )
  .setDMPermission(false);

export const autocomplete = async (interaction, state) => {
  const focusedValue = interaction.options.getFocused().toUpperCase();
  const choices = state.personalities.map((p) => p.name);
  const filtered = choices.filter((choice) =>
    choice.toUpperCase().includes(focusedValue)
  );

  await interaction.respond(
    filtered.map((choice) => ({ name: choice, value: choice }))
  );
};

export const execute = async (interaction, state) => {
  // Check admin/pause state
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
    state.isPaused === true
  ) {
    await interaction.reply({
      content: process.env.DISABLED_MSG,
      ephemeral: true,
    });
    return;
  }

  const personalityChoice = interaction.options.getString("personality");

  // Check if personality already exists
  const personality = state.personalities.find(
    (p) => p.name.toUpperCase() === personalityChoice.toUpperCase()
  );

  if (!personality) {
    return await interaction.reply({
      content: process.env.SET_PERS_ERROR_MSG,
      ephemeral: true,
    });
  }

  state.members[interaction.member.user.id] = personality.name;

  await interaction.reply({
    content: process.env.SET_PERSONALITY_MSG.replace("<n>", personality.name),
    ephemeral: true,
  });
};

export default {
  data,
  execute,
  autocomplete,
};
