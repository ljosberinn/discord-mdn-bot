import { ButtonStyle, Guild, GuildMember } from 'discord.js';
import { ButtonBuilder, MessageActionRowComponentBuilder, StringSelectMenuBuilder } from 'discord.js';
import { ActionRowBuilder } from 'discord.js';

import { NOTIFY_ROLES } from '../../roles/consts/notifyRoles.js';
import { ROLES } from '../../roles/consts/roles.js';
import type { UserStateType } from '../db/user_state';
import { getThread } from '../utils/getThread.js';
import { sneakPin } from '../utils/sneakPin.js';

export async function handleRoleSelection(
  guild: Guild,
  member: GuildMember,
  oldState: UserStateType,
  fromStart: boolean
): Promise<void> {
  const thread = await getThread(guild, oldState.threadId);
  const pinned = await thread.messages.fetchPinned();
  if (pinned.size > 0) {
    return;
  }
  const rolesMsg = await thread.send({
    content: `**Final Step!**

We have quite a few channels, so to gain access to them, you'll need to opt in to viewing them. Fortunately, that's the step you're on now. Use the select box below to pick which channels you'd like to see, or hit the button to opt in to viewing all the channels.`,
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents([
        new StringSelectMenuBuilder()
          .addOptions(
            ROLES.map(x => ({
              label: x.name,
              value: x.name,
            }))
          )
          .setCustomId('onboarding🤔roles')
          .setMinValues(1)
          .setMaxValues(ROLES.length)
          .setPlaceholder("Pick which roles you're interested in"),
      ]),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('onboarding🤔roles🤔All Development')
          .setLabel('View All Development Channels')
          .setStyle(ButtonStyle.Primary)
      ),
    ],
  });

  const notificationRoles = await thread.send({
    content:
      'We also have some roles for if you wish to be notified about various optional announcements, which you can opt into here:',
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents([
        new StringSelectMenuBuilder()
          .addOptions(
            NOTIFY_ROLES.map(x => ({
              label: x.name,
              value: x.name,
              emoji: x.emoji,
              description: x.description,
            }))
          )
          .setCustomId('onboarding🤔notify_roles')
          .setMinValues(1)
          .setMaxValues(NOTIFY_ROLES.length),
      ]),
    ],
  });

  await sneakPin(rolesMsg);
  await sneakPin(notificationRoles);
  if (fromStart) {
    await rolesMsg.reply({
      content: `Hey ${member.toString()}, seems like something went wrong during your onboarding, this could be because you left during it or the bot was down. You should be able to continue from here.`,
    });
  }
}
