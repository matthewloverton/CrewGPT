// Use this file to deploy or delete bot commands
//      node deploy-commands.js                                    - deploy all commands in commands/index.js
//      node deploy-commands.js -d ID                              - delete a global command with id
//      Args Usage:
//          -d <command_id>: Delete a command by its ID.

import { config } from "dotenv";
import { REST, Routes, Client, Events, GatewayIntentBits } from "discord.js";
import { commands } from "./commands/index.js";

// Initialize command files
const args = process.argv.slice(2);
let deleteCommandId = null;
const deleteIndex = args.findIndex((arg) => arg === "-d");
if (deleteIndex) deleteCommandId = args[deleteIndex + 1];

config();

let commandData = [];

// Get command details
for (const command of commands) {
  commandData.push(command.data.toJSON());
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: "10" }).setToken(process.env.CLIENT_TOKEN);

let clientId;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Run once logged in
client.once(Events.ClientReady, (c) => {
  clientId = client.user.id;

  // Deploy (or delete) commands
  (async () => {
    if (deleteCommandId) {
      try {
        await rest.delete(Routes.applicationCommand(clientId, deleteCommandId));
        console.log(
          `Successfully deleted application command with ID: ${deleteCommandId}`
        );
      } catch (error) {
        console.error(error);
      }
    } else {
      try {
        console.log(
          `Started refreshing ${commandData.length} application (/) commands.`
        );
        const data = await rest.put(Routes.applicationCommands(clientId), {
          body: commandData,
        });
        console.log(
          `Successfully reloaded ${data.length} application (/) commands.`
        );
      } catch (error) {
        console.error(error);
      }
    }
  })();

  // Logout
  client.destroy();
});
// Login to client to get client ID
client.login(process.env.CLIENT_TOKEN);
