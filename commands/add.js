// Requre the necessary discord.js classes
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("add-personality")
  .setDescription("Add a new personality to the bot.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("Name the new personality.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("description")
      .setDescription("Describe what the new personality is or does.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("behaviour")
      .setDescription(
        "Input a System prompt for the new personalities behaviour."
      )
      .setRequired(true)
  )
  .setDMPermission(false);

export const execute = async (interaction, state) => {
  // Check admin/pause state
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
    state.isPaused === true
  ) {
    await interaction.reply(process.env.DISABLED_MSG);
    return;
  }
  const name = interaction.options.getString("name");
  const description = interaction.options.getString("description");
  const behaviour = interaction.options.getString("behaviour");

  // Check if personality already exists
  const existingPersonality = state.personalities.find(
    (p) => p.name.toUpperCase() === name.toUpperCase()
  );
  if (existingPersonality) {
    return await interaction.reply(process.env.UPDATE_PERS_ERROR_MSG);
  }

  // Add the new personality
  state.personalities.push({
    name: name,
    description: description,
    systemPrompt: [
      {
        role: "system",
        content: `${behaviour}`,
      },
    ],
  });

  await interaction.reply(
    process.env.ADDED_PERSONALITY_MSG.replace("<n>", name)
  );
};

export default {
  data,
  execute,
};
