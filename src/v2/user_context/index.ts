import { ApplicationCommandType, Client } from 'discord.js';
import { Collection } from 'discord.js';

// quick responses
// base commands
// meme commands

const guildCommands = new Collection([]); // placeholder for now

export const registerUserContextMenu = async (
  client: Client
): Promise<void> => {
  const existingCommands = await client.application.commands.fetch();
  existingCommands.sweep(x => x.type !== ApplicationCommandType.User);

  client.application.commands.set([]);

  client.on('interactionCreate', interaction => {
    if (!interaction.isUserContextMenuCommand()) {
      return;
    }
    console.log({ interaction });
  });
};
