// Requre the necessary discord.js classes
import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("token-count")
  .setDescription("Show amount of tokens used since bot was started.")
  .setDMPermission(false);

export const execute = async (interaction, state) => {
  let message = process.env.TOKEN_COUNT_MSG.replace(
    "<t>",
    state.totalTokenCount
  );
  message = message.replace("<d>", state.startTime.toLocaleDateString());
  message = message.replace(
    "<c>",
    "$" + Math.round(state.totalTokenCount * 0.0002) / 100
  );
  await interaction.reply(message);
};

export default {
  data,
  execute,
};
