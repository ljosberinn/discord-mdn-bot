import { ButtonStyle, Guild, GuildMember, MessageActionRowComponentBuilder } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder } from 'discord.js';

import { UserStateType } from '../db/user_state';
import { getThread } from '../utils/getThread.js';

export async function handleStart(
  guild: Guild,
  member: GuildMember,
  oldState: UserStateType,
  fromStart: boolean
): Promise<void> {
  const thread = await getThread(guild, oldState.threadId);
  const pinned = await thread.messages.fetchPinned();

  const rulesMsg = pinned.last();

  setTimeout(async () => {
    await rulesMsg.edit({
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents([
          new ButtonBuilder()
            .setStyle(ButtonStyle.Success)
            .setLabel('I have read, and agree to follow the rules')
            .setCustomId('onboarding🤔rules_agreed'),
        ]),
      ],
    });
  }, 15_000);

  if (fromStart) {
    await pinned.last().reply({
      content: `Hey ${member.toString()}, seems like something went wrong during your onboarding, this could be because you left during it or the bot was down. You should be able to continue from here.`,
    });
  }
}
