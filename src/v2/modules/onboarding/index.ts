import { Client, Guild, GuildMember, Message, MessageType, PermissionFlagsBits, PermissionOverwriteManager, PermissionsBitField, Role, TextChannel } from 'discord.js';

import { SERVER_ID } from '../../env.js';
import { NEW_USER_ROLE, ONBOARDING_CHANNEL, JOIN_LOG_CHANNEL } from '../../env.js';
import { UserState } from './db/user_state.js';
import { handleIntroductionMsg } from './events/handleIntroductionMsg.js';
import { handleMemberLeave } from './events/handleMemberLeave.js';
import { handleNewMember } from './events/handleNewMember.js';
import { handleNotifyRolesSelected } from './events/handleNotifyRolesSelected.js';
import { handleRoleSelected } from './events/handleRoleSelected.js';
import { handleRulesAgree } from './events/handleRulesAgree.js';
import { handleSkipIntro } from './events/handleSkipIntro.js';
import { handleThreadArchived } from './events/handleThreadArchived.js';
import { getMessagesUntil } from './utils/getMessagesUntil.js';
import { limitToWebDevServer } from './utils/limitToWebDevServer.js';
import { getOnboardingStart } from './utils/onboardingStart.js';

export async function attach(client: Client): Promise<void> {
  const guild = client.guilds.resolve(SERVER_ID);
  const role = guild.roles.cache.get(NEW_USER_ROLE);
  addNewRolePermissions(guild, role);

  client.on('guildMemberAdd', limitToWebDevServer(handleNewMember));
  client.on('interactionCreate', limitToWebDevServer(handleRoleSelected));
  client.on(
    'interactionCreate',
    limitToWebDevServer(handleNotifyRolesSelected)
  );
  client.on('interactionCreate', limitToWebDevServer(handleRulesAgree));
  client.on('interactionCreate', limitToWebDevServer(handleSkipIntro));
  client.on('messageCreate', limitToWebDevServer(handleIntroductionMsg));
  client.on('guildMemberRemove', limitToWebDevServer(handleMemberLeave));
  client.on('threadUpdate', limitToWebDevServer(handleThreadArchived));

  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) {
      return;
    }

    const [type, subtype] = interaction.customId.split('🤔');

    if (type === 'debug' && subtype === 'new_user') {
      await UserState.deleteOne({
        userId: interaction.user.id,
      });
      handleNewMember(interaction.member as GuildMember);
    }
  });

  await playCatchup(guild);
}
async function playCatchup(guild) {
  const catchUpFrom = await getOnboardingStart();

  if (!catchUpFrom) {
    return;
  }

  const joinLogChannel = (await guild.channels.fetch(
    JOIN_LOG_CHANNEL
  )) as TextChannel;
  const userState = await UserState.findOne({}).sort('updatedAt');

  const userMap = new Map<string, Message>();
  for await (const message of getMessagesUntil(
    joinLogChannel,
    userState?.updatedAt ?? new Date(catchUpFrom)
  )) {
    if (
      message.type === MessageType.UserJoin &&
      message.member &&
      !userMap.has(message.member.id)
    ) {
      userMap.set(message.member.id, message);
    }
  }

  for (const [, message] of userMap) {
    handleNewMember(message.member);
  }
}

function addNewRolePermissions(guild: Guild, role: Role) {
  const permissionFlags = PermissionsBitField.Default & ~PermissionsBitField.Flags.ViewChannel
  const permissions = new PermissionsBitField(permissionFlags)

  for (const [, channel] of guild.channels.cache) {
    if (
      'permissionOverwrites' in channel &&
      channel.id !== ONBOARDING_CHANNEL
    ) {
      try {
        channel.permissionOverwrites.create(role, permissions.serialize());
      } catch (error) {
        console.error(error);
      }
    }
  }
}
