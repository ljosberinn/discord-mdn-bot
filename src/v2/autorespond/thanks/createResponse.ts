import { ButtonBuilder, MessageReplyOptions } from 'discord.js';
import { ActionRowBuilder, UserSelectMenuBuilder } from 'discord.js';
import { User, MessagePayload, ButtonStyle } from 'discord.js';
import type { EmbedField, Collection, MessageActionRowComponentBuilder } from 'discord.js';

import { clampLength } from '../../utils/clampStr.js';
import { createEmbed } from '../../utils/discordTools.js';

export function createResponse(
  thankedUsers: Collection<string, User>,
  authorId: string
): MessageReplyOptions {
  const title = `Point${thankedUsers.size === 1 ? '' : 's'} received!`;

  const description = `<@!${authorId}> has given a point to ${thankedUsers.size === 1
    ? `<@!${thankedUsers.first().id}>`
    : 'the users mentioned below'
    }!`;

  const fields: EmbedField[] =
    thankedUsers.size > 1
      ? [...thankedUsers].map(([, u], i) => ({
        inline: false,
        name: `${(i + 1).toString()}.`,
        value: `<@!${u.id}>`,
      }))
      : [];

  const output = createEmbed({
    description,
    fields,
    footerText:
      'Thank a helpful member by replying "thanks @username" or saying "thanks" in a reply or thread.',
    provider: 'helper',
    title,
  }).embed;

  return {
    embeds: [output],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        thankedUsers.size > 1
          ? new UserSelectMenuBuilder()
            .setCustomId(`thanks🤔${authorId}🤔select`)
            .setPlaceholder('Accidentally Thank someone? Un-thank them here!')
            .setMinValues(1)
            .setDefaultUsers(
              ...thankedUsers.keys()
            )
          : new ButtonBuilder()
            .setCustomId(`thanks🤔${authorId}🤔${thankedUsers.first().id}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('This was an accident, UNDO!')
      ),
    ],
  }
}
