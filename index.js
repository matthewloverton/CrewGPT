import { readdirSync } from "fs";
import { join } from "path";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
} from "discord.js";
import { config } from "dotenv";
import { Configuration, OpenAIApi } from "openai";
import { mapDefaultPersonalities, defaultPersonalities } from "./common.js";
import { scheduleJob } from "node-schedule";
import { commands } from "./commands/index.js";

// dotenv init
config();

// setup cleanup job
const schedule = scheduleJob("/20 * * * * *", () => {
  const now = Date.now();
  console.log("schedule fired", now);
});

// Set OpenAI API key
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

// Setup OpenAI
const openai = new OpenAIApi(configuration);

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize Commands
client.commands = new Collection();

// Initialize command files
for (const command of commands) {
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  client.commands.set(command.data.name, command);
}

// Console log when logged in
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Create state array
let state = {
  isPaused: false,
  personalities: [],
  tokenTimer: null,
  tokenCount: null,
  startTime: new Date(),
  totalTokenCount: 0,
  slowModeTimer: {},
};

// Run function
state.personalities = mapDefaultPersonalities(defaultPersonalities);

// Get called personality from message
function getPersonality(message) {
  // Function to check for the personality name
  const checkPers = (msg, word) =>
    new RegExp("\\b" + word + "\\b", "i").test(msg);
  let personality = null;
  // For each personality, check if the message includes the the name of the personality
  for (let i = 0; i < state.personalities.length; i++) {
    let thisPersonality = state.personalities[i];
    if (checkPers(message, thisPersonality.name)) {
      personality = thisPersonality;
    }
  }
  // Return the personality of the message
  return personality;
}

// Split message function
function splitMessage(resp, charLim) {
  const responseNum = Math.ceil(resp.length / charLim);
  const responses = new Array(responseNum);
  // For the number of split responses, if its the last response, make the size the character limit, else make the size the last index of a space that is under 2000 characters
  for (
    let i = 0, c = 0, chunkSize = null;
    i < responseNum;
    i++, c += chunkSize
  ) {
    if (i + 1 >= responseNum) {
      chunkSize = charLim;
    } else {
      chunkSize = resp.substr(c, charLim).lastIndexOf(" ");
    }
    responses[i] = resp.substr(c, chunkSize);
  }
  return responses;
}

// Set channels
const channelIds = process.env.CHANNELS?.split(",");

// Set admin user IDs
const adminIds = process.env.ADMIN_ID?.split(",");

let isUnrestricted = null;

// Check message author id function
function isAdmin(msg) {
  if (
    msg.member.permissions.has(PermissionFlagsBits.Administrator) ||
    msg.member.permissions.has(PermissionFlagsBits.ManageMessages)
  ) {
    return true;
  } else {
    return adminIds.includes(msg.author.id);
  }
}

function deleteThread(threadId) {
  for (let i = 0; i < state.personalities.length; i++) {
    let personality = state.personalities[i];
    if (personality.threads.hasOwnProperty(threadId)) {
      return delete personality.threads[threadId];
    }
  }
}

// Listen for interactions/Commands
client.on(Events.InteractionCreate, async (interaction) => {
  // Don't do anything if the interaction is not a slash command
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  // Execute the command and log errors if they appear
  try {
    await command.execute(interaction, state);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }
});

client.on("messageCreate", async (msg) => {
  // Don't do anything when not in bot channel
  const channelCond = [
    msg.channelId,
    msg.channel.name,
    msg.channel?.parentId,
    msg.channel?.parent?.name,
  ];
  if (
    channelIds != "" &&
    typeof channelIds !== "undefined" &&
    !channelCond.some((cond) => channelIds.includes(cond))
  ) {
    return;
  }

  // Don't do anything when message is from self or bot depending on config
  if (
    (process.env.BOT_REPLIES === "true" && msg.author.id === client.user.id) ||
    (process.env.BOT_REPLIES !== "true" && msg.author.bot)
  )
    return;

  // Don't reply to system messages
  if (msg.system) return;

  let p = null;

  // Check if message is from joined thread if no personality name
  if (p == null && msg.channel.isThread() && msg.channel.joined) {
    initialPrompt = await msg.channel.fetchStarterMessage();

    // Set personality to last message from bot personality
    p = getPersonality(initialPrompt?.content.toUpperCase());
  }

  // Run get personality from message function if not reply to bot
  if (p == null) {
    p = getPersonality(msg.content.toUpperCase());
  }

  // Don't reply if no personality found
  if (p == null) return;

  // Check if it is a new month
  let today = new Date();
  if (state.startTime.getUTCMonth() !== today.getUTCMonth()) {
    state.startTime = new Date();
    state.totalTokenCount = 0;
  }

  let request = null;

  if (msg.channel.isThread()) {
    p.threads[msg.channelId].push({ role: "user", content: `${msg.content}` });
  } else {
    // Add user message to request
    request = [...p.request];
    request.push({ role: "user", content: `${msg.content}` });
  }

  // Truncate conversation if # of messages in conversation exceed MSG_LIMIT
  if (msg.channel.isThread()) {
    if (
      process.env.MSG_LIMIT !== "" &&
      p.threads[msg.channelId].length - 1 > parseInt(process.env.MSG_LIMIT, 10)
    ) {
      let delMsg =
        p.threads[msg.channelId].length -
        1 -
        parseInt(process.env.MSG_LIMIT, 10);
      p.threads[msg.channelId].splice(1, delMsg);
    }
  }

  // Start typing indicator
  msg.channel.sendTyping();
  // Run API request function
  const response = msg.channel.isThread()
    ? await chat(p.threads[msg.channelId], msg)
    : await chat(request, msg);

  // Split response if it exceeds the Discord 2000 character limit
  const responseChunks = splitMessage(response, 2000);
  // Send the split API response
  for (let i = 0; i < responseChunks.length; i++) {
    if (msg.channel.isThread()) {
      msg.channel.send(responseChunks[i]);
    } else {
      const title = await summarize(msg.content);
      const thread = await msg.startThread({
        name: title,
        autoArchiveDuration: 60,
      });
      thread.send(responseChunks[i]);
      p.threads[thread.id] = request;
    }
    break;
  }
});

const chat = async (requestX, msg) => {
  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: requestX,
    });

    // Increase token counter if not admin
    if (!isAdmin(msg) && !isUnrestricted) {
      state.tokenCount += completion.data.usage.completion_tokens;
    }

    // Increase total token count
    state.totalTokenCount += completion.data.usage.total_tokens;

    let responseContent = completion.data.choices[0].message.content;

    // Add assistant message to next request
    requestX.push({ role: "assistant", content: `${responseContent}` });

    return responseContent;
  } catch (error) {
    // Return error message if API error occurs
    console.error(`[ERROR] OpenAI API request failed: ${error}`);
    return process.env.API_ERROR_MSG;
  }
};

const summarize = async (prompt) => {
  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "Summarize the input question into a short question, only output the question itself.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Increase total token count
    state.totalTokenCount += completion.data.usage.total_tokens;

    return completion.data.choices[0].message.content;
  } catch (error) {
    // Return error message if API error occurs
    console.error(`[ERROR] OpenAI API request failed: ${error}`);
    return process.env.API_ERROR_MSG;
  }
};

// Log in to Discord with your client's token
client.login(process.env.CLIENT_TOKEN);
