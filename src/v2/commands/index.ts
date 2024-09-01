// This is required so far in this file
/* eslint-disable no-await-in-loop */
import {
  ApplicationCommand,
  ApplicationCommandData,
  ApplicationCommandManager,
  ApplicationCommandType,
  Client,
  Guild,
  GuildApplicationCommandManager,
  GuildResolvable,
} from 'discord.js';
import { Collection } from 'discord.js';
import { filter } from 'domyno';
import { isEqual } from 'lodash-es';

import type { CommandDataWithHandler } from '../../types';
import { setupCommands } from '../modules/mod/commands/index.js';
import { roleCommands } from '../modules/roles/commands/index.js';
import { asyncCatch } from '../utils/asyncCatch.js';
import { map } from '../utils/map.js';
import { merge } from '../utils/merge.js';
import { normalizeApplicationCommandData } from '../utils/normalizeCommand.js';
import { pipe } from '../utils/pipe.js';
import { difference, intersection } from '../utils/sets.js';
// quick responses
// base commands
import { aboutInteraction } from './about/index.js';
import { mdnCommand } from './mdn/index.js';
import { npmInteraction } from './npm/index.js';
import { phpCommand } from './php/index.js';
import { pleaseInteraction } from './please/index.js';
import { pointsHandlers } from './points/index.js';
import { resourceInteraction } from './resource/index.js';
// meme commands
import { shitpostInteraction } from './shitpost/index.js';
// import { warn } from './warn/index.js';
import { whynoInteraction } from './whyno/index.js';

export const guildCommands = new Map(
  [
    aboutInteraction,
    mdnCommand,
    phpCommand,
    pleaseInteraction,
    pointsHandlers,
    resourceInteraction,
    shitpostInteraction,
    npmInteraction,
    whynoInteraction,
    roleCommands,
    setupCommands,
    // warn // Not used atm
  ].map(command => [command.name, command])
); // placeholder for now

export const applicationCommands = new Collection<
  string,
  CommandDataWithHandler
>();

const getRelevantCmdProperties = ({
  description,
  name,
  options,
}: {
  description: string;
  name: string;
  options?: readonly unknown[];
}): ApplicationCommandData => {
  const relevantData = {
    description,
    name,
    options,
  } as unknown as ApplicationCommandData;
  return stripNullish(normalizeApplicationCommandData(relevantData));
};

const stripNullish = <T>(obj: T): T => {
  if (typeof obj !== 'object' && obj !== null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(stripNullish) as typeof obj;
  }

  return Object.fromEntries(
    Object.entries(obj)
      .map(([a, b]) => [a, stripNullish(b)])
      .filter(([, b]) => b != null)
  ) as T;
};

export const registerCommands = async (client: Client): Promise<void> => {
  client.on(
    'interactionCreate',
    asyncCatch(async interaction => {
      if (!interaction.isChatInputCommand()) {
        return;
      }

      try {
        if (applicationCommands.has(interaction.commandName)) {
          await applicationCommands
            .get(interaction.commandName)
            ?.handler(client, interaction);
        } else if (guildCommands.has(interaction.commandName)) {
          await guildCommands
            .get(interaction.commandName)
            ?.handler(client, interaction);
        } else {
          await interaction.reply({
            ephemeral: true,
            content: "Couldn't recognize command.",
          });
        }
      } catch (error) {
        await interaction.reply({
          ephemeral: true,
          content: 'Something went wrong when trying to execute the command',
        });
      }
    })
  );

  for (const { onAttach } of applicationCommands.values()) {
    // We're attaching these so it's fine

    onAttach?.(client);
  }

  for (const { onAttach } of guildCommands.values()) {
    // We're attaching these so it's fine

    onAttach?.(client);
  }

  for (const [, oauth2Guild] of await client.guilds.fetch()) {
    let guild: { name: string } | Guild = { name: 'FAILED_TO_FETCH_GUILD' };
    try {
      guild = await oauth2Guild.fetch();
      const cmds = await (guild as Guild).commands.fetch();
      await addCommands(cmds, guildCommands, (guild as Guild).commands);
    } catch (error) {
      console.error(`Failed to add commands to guild: ${guild.name}`, error);
    }
  }
  console.log('Guild specific commands added');

  const discordCommandsById = await client.application.commands.fetch();
  await addCommands(
    discordCommandsById,
    applicationCommands,
    client.application.commands
  );

  console.log('General Commands All Added');
  // await client.application?.commands.set([{type:''}])
  // await client.guilds.cache.get('618935554171469834').commands.set([]);

  // client.guilds.cache.forEach(guild => {
  //   guild.commands.set([])
  // })
};

async function addCommands(
  serverCommands: Collection<
    string,
    ApplicationCommand<{ guild: GuildResolvable }>
  >,
  commandDescriptions: Map<string, CommandDataWithHandler>,
  commandManager: ApplicationCommandManager | GuildApplicationCommandManager
) {
  const discordChatInputCommandsById = serverCommands.filter(
    x => x.type === ApplicationCommandType.ChatInput
  );

  const discordCommands = new Collection(
    discordChatInputCommandsById.map(value => [value.name, value])
  );

  const validCommands = pipe<
    Iterable<[string, CommandDataWithHandler]>,
    Iterable<string>
  >([
    filter<[string, CommandDataWithHandler]>(
      ([key, val]: [string, CommandDataWithHandler]) =>
        'guild' in commandManager && val.guildValidate
          ? val.guildValidate(commandManager.guild)
          : true
    ),
    map(([key]) => key),
  ]);

  const newCommands = difference(
    validCommands(commandDescriptions),
    discordCommands.keys()
  );
  const existingCommands = intersection(
    validCommands(commandDescriptions),
    discordCommands.keys()
  );
  const deletedCommands = difference<string>(
    discordCommands.keys(),
    validCommands(commandDescriptions)
  );

  // const new = await client.application.commands.create()
  await Promise.all(
    merge(
      createNewCommands(commandDescriptions, commandManager)(newCommands),
      editExistingCommands(
        commandDescriptions,
        commandManager,
        discordCommands
      )(existingCommands),
      deleteRemovedCommands(commandManager, discordCommands)(deletedCommands)
    )
  );
}

function getDestination(
  commandManager: ApplicationCommandManager | GuildApplicationCommandManager
) {
  return 'guild' in commandManager
    ? `Guild: ${commandManager.guild.name}`
    : 'App';
}

function createNewCommands(
  cmdDescriptions: Map<string, CommandDataWithHandler>,
  cmdMgr: ApplicationCommandManager | GuildApplicationCommandManager
) {
  const destination = getDestination(cmdMgr);
  return map(async (name: string) => {
    const command = cmdDescriptions.get(name);
    // this is always true
    if (command) {
      const { onAttach, handler, ...rest } = command;
      console.info(`Adding Command ${name} for ${destination}`);

      return cmdMgr.create(rest);
    }
  });
}

function editExistingCommands(
  cmdDescriptions: Map<string, CommandDataWithHandler>,
  cmdMgr: ApplicationCommandManager | GuildApplicationCommandManager,
  existingCommands: Map<string, ApplicationCommand>
) {
  const destination = getDestination(cmdMgr);
  return map((name: string) => {
    const cmd = cmdDescriptions.get(name);
    const existing = existingCommands.get(name);

    const { onAttach, handler, ...command } = cmd;

    if (
      !isEqual(
        getRelevantCmdProperties(cmd),
        getRelevantCmdProperties(existing)
      )
    ) {
      console.info(`Updating ${name} for ${destination}`);

      return cmdMgr.edit(existing.id, command);
    }
  });
}

function deleteRemovedCommands(
  cmdMgr: ApplicationCommandManager | GuildApplicationCommandManager,
  existingCommands: Map<string, ApplicationCommand>
) {
  const destination = getDestination(cmdMgr);
  return map(async (name: string) => {
    const existing = existingCommands.get(name);
    console.warn(`Deleting ${name} from ${destination}`);

    return cmdMgr.delete(existing.id);
  });
}
