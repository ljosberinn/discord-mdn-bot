import { ButtonStyle, Guild, GuildMember, MessageActionRowComponentBuilder } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder } from 'discord.js';

import { INTRO_CHANNEL, INTRO_ROLE } from '../../../env.js';
import { UserStateType } from '../db/user_state';
import { getThread } from '../utils/getThread.js';
import { sneakPin } from '../utils/sneakPin.js';

export async function handleIntroduction(
  guild: Guild,
  member: GuildMember,
  oldState: UserStateType,
  fromStart: boolean
): Promise<void> {
  const thread = await getThread(guild, oldState.threadId);
  const pinned = await thread.messages.fetchPinned();

  if (pinned.size === 0) {
    const msg = await thread.send({
      content: `:point_left: You should now have access to the <#${INTRO_CHANNEL}> channel. It would be great if you could introduce yourself in that channel. We understand if you don't want to, however, so feel free to skip this step now, or do it later`,
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents([
          new ButtonBuilder()
            .setLabel('Skip')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⏩')
            .setCustomId('onboarding🤔skip_intro'),
        ]),
      ],
    });

    await sneakPin(msg);

    member.roles.add(INTRO_ROLE);
  }

  if (fromStart) {
    await pinned.last().reply({
      content: `Hey ${member.toString()}, seems like something went wrong during your onboarding, this could be because you left during it or the bot was down. You should be able to continue from here.`,
    });
  }
}
