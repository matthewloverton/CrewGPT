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
import { ToadScheduler, SimpleIntervalJob, Task } from "toad-scheduler";
import { commands } from "./commands/index.js";

// dotenv init
config();

const milliseconds = (h, m, s) => (h * 60 * 60 + m * 60 + s) * 1000;

// setup cleanup job
const scheduler = new ToadScheduler();
const cleanupTask = new Task("clean threads", () => {
  let now = Date.now();
  let cleanup = 0;
  for (let i = state.threads.length - 1; i >= 0; i--) {
    let thread = state.threads[i];
    let cleanupTime = milliseconds(1, 0, 0);
    let diff = now - thread.created_at;
    if (cleanupTime < diff) {
      let clientThread = client.channels.cache.find(
        (channel) => channel.id === thread.id
      );
      if (clientThread) clientThread.delete("Cleaning up threads.");
      state.threads.splice(i, 1);
      cleanup++;
    }
  }
  console.log(`cleaned up ${cleanup} threads.`);
});
const cleanupJob = new SimpleIntervalJob({ hours: 1 }, cleanupTask);
scheduler.addSimpleIntervalJob(cleanupJob);

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
  threads: [],
  members: {},
};

// Run function
state.personalities = mapDefaultPersonalities(defaultPersonalities);

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

// Listen for interactions/Commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
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
  } else if (interaction.isAutocomplete()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
      return;
    }

    try {
      await command.autocomplete(interaction, state);
    } catch (error) {
      console.error(error);
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

  // Check if message is a reply
  if (msg.reference?.messageId) {
    let refMsg = await msg.fetchReference();
    // Check if the reply is to the bot
    if (!(refMsg.author.id === client.user.id)) return;
  } else if (!msg.mentions.parsedUsers.find((u) => u.client.id === client.id))
    return;

  let p = state.personalities[0];
  let threadId = null;
  let thread = null;
  let newThread = null;

  if (state.members[msg.author.id]) {
    p = state.personalities.find(
      (p) => p.name === state.members[msg.author.id]
    );
  }

  if (msg.channel.isThread()) {
    threadId = msg.channelId;
    thread = state.threads.find((thread) => thread.id === threadId);
  } else {
    msg.react("🧠");
    const title = await summarize(msg.content);
    newThread = await msg.startThread({
      name: title,
      autoArchiveDuration: 60,
    });
  }

  // Check if it is a new month
  let today = new Date();
  if (state.startTime.getUTCMonth() !== today.getUTCMonth()) {
    state.startTime = new Date();
    state.totalTokenCount = 0;
  }

  let request = null;

  if (newThread) {
    request = [...p.systemPrompt];
    request.push({ role: "user", content: `${msg.content}` });
    thread = {
      id: newThread.id,
      request: request,
      created_at: Date.now(),
    };
    state.threads.push(thread);
  } else {
    thread.request.push({
      role: "user",
      content: `${msg.content}`,
    });
    if (
      process.env.MSG_LIMIT !== "" &&
      thread.request.length - 1 > parseInt(process.env.MSG_LIMIT, 10)
    ) {
      let delMsg =
        thread.request.length - 1 - parseInt(process.env.MSG_LIMIT, 10);
      thread.request.splice(1, delMsg);
    }
  }

  // Start typing indicator
  newThread ? newThread.sendTyping() : msg.channel.sendTyping();
  // Run API request function
  const response = newThread
    ? await chat(request, msg)
    : await chat(thread.request, msg);

  // Split response if it exceeds the Discord 2000 character limit
  const responseChunks = splitMessage(response, 2000);
  // Send the split API response
  for (let i = 0; i < responseChunks.length; i++) {
    if (newThread) {
      newThread.send(responseChunks[i]);
    } else {
      msg.channel.send(responseChunks[i]);
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
            "I want you to act as a title generator. I will type give you sentence or question and you will reply a title.",
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

process.on("SIGTERM", (signal) => {
  console.log(`Process ${process.pid} received a SIGTERM signal`);
  scheduler.stop();
  process.exit(0);
});

process.on("SIGINT", (signal) => {
  console.log(`Process ${process.pid} has been interrupted`);
  scheduler.stop();
  process.exit(0);
});
