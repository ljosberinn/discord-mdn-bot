import { ActionRowBuilder, ChannelType, EmbedBuilder, MessageActionRowComponentBuilder, StringSelectMenuBuilder, } from 'discord.js';
import { ComponentType, Message, TextChannel } from 'discord.js';
import type { Client } from 'discord.js';

import { POINT_LIMITER_IN_MINUTES } from '../../env.js';
import HelpfulRoleMember from '../../helpful_role/db_model.js';
import pointHandler from '../../helpful_role/point_handler.js';
import { stripMarkdownQuote } from '../../utils/content_format.js';
import { createEmbed } from '../../utils/discordTools.js';
import { mapʹ } from '../../utils/map.js';
import { difference } from '../../utils/sets.js';
import { createResponse } from './createResponse.js';
import type { ThanksInteractionType } from './db_model.js';
import { ThanksInteraction } from './db_model.js';
import { handleThreadThanks } from './threadThanks.js';

type CooldownUser = {
  id: string;
  timestamp: number;
};

export const extractUserID = (s: string): string | null =>
  /<@!?/u.test(s) ? s.split(/<@!?/u)[1].split('>')[0] : null;

const listFormatter = new Intl.ListFormat();

const timeUntilCooldownReset = (entry: number) =>
  Math.round(
    Number.parseInt(POINT_LIMITER_IN_MINUTES) - (Date.now() - entry) / 60_000
  );

const getReply = async (msg: Message): Promise<undefined | Message> => {
  if (msg.reference) {
    const { messageId } = msg.reference;
    return msg.channel.messages.fetch(messageId);
  }
};

const handleThanks = async (msg: Message): Promise<void> => {
  const botId = msg.author.bot;
  const reply = await getReply(msg);
  if (botId || (msg.mentions.users.size === 0 && !reply)) {
    if (
      [ChannelType.PrivateThread, ChannelType.PublicThread].includes(msg.channel.type)
    ) {
      await handleThreadThanks(msg);
    }
    return; // Break if no user has been mentioned
  }

  /**
   * Filter out all unwanted users.
   * A unwanted user is anyone who's a bot, is the actual message author itself,
   * or if the user's already been given a point by the message author.
   * also ignoring all names that were only mentioned in a quote.
   */

  const quoteLessContent = stripMarkdownQuote(msg.content);

  const previousThanksInteractions: ThanksInteractionType[] =
    await ThanksInteraction.find({
      thanker: msg.author.id,
      createdAt: {
        $gte: Date.now() - Number.parseInt(POINT_LIMITER_IN_MINUTES) * 60_000,
      },
    }).exec();

  const previousThanksIds = new Set(
    previousThanksInteractions.flatMap(item => item.thankees)
  );
  const lastThanked = new Map(
    previousThanksInteractions.flatMap(item =>
      item.thankees.map(x => [x, item.createdAt])
    )
  );
  const unquotedMentionedUserIds = new Set(
    mapʹ(([, id]) => id, quoteLessContent.matchAll(/<@!?(\d+)>/gu))
  );

  const usersOnCooldown: CooldownUser[] = [];

  const mentionedUsersWithReply = msg.mentions.users.clone();
  if (reply) {
    unquotedMentionedUserIds.add(reply.author.id);
    mentionedUsersWithReply.set(reply.author.id, reply.author);
  }

  const thankableUsers = mentionedUsersWithReply.filter(u => {
    if (!unquotedMentionedUserIds.has(u.id)) {
      return false;
    }

    const entry = previousThanksIds.has(u.id);

    if (entry) {
      usersOnCooldown.push({
        id: u.id,
        timestamp: lastThanked.get(u.id).getTime(),
      });
    }

    return !u.bot && u.id !== msg.author.id && !entry;
  });

  if (usersOnCooldown.length > 0) {
    const dm = await msg.author.createDM();

    dm.send({
      embeds: [
        createEmbed({
          description:
            'You cannot thank the following users for the period of time shown below their names:',
          fields: usersOnCooldown.map((u, i) => {
            const diff = timeUntilCooldownReset(u.timestamp);
            return {
              inline: false,
              name: `${i + 1}`,
              value: `<@!${u.id}>\n${diff} minute${diff === 1 ? '' : 's'}.`,
            };
          }),
          footerText: `You can only give a point to a user every ${POINT_LIMITER_IN_MINUTES} minute${Number.parseInt(POINT_LIMITER_IN_MINUTES) === 1 ? '' : 's'
            }.`,
          provider: 'spam',
          title: 'Cooldown alert!',
        }).embed,
      ],
    });
  }

  // Break if no valid users remain
  if (thankableUsers.size === 0) {
    return;
  }

  thankableUsers.forEach(async user => pointHandler(user.id, msg));
  const msgData = createResponse(thankableUsers, msg.author.id);

  const response = await msg.channel.send(msgData);

  await ThanksInteraction.create({
    thanker: msg.author.id,
    guild: msg.guildId,
    channel: msg.channelId,
    thankees: thankableUsers.map(u => u.id),
    responseMsgId: response.id,
  });
};

function attachUndoThanksListener(client: Client): void {
  client.on('interactionCreate', async interaction => {
    if (!(interaction.isButton() || interaction.isStringSelectMenu())) {
      return;
    }
    const id = interaction.customId;
    const msgId = interaction.message.id;
    const [type, authorId, thankeeId] = id.split('🤔');

    if (type !== 'thanks') {
      return;
    }

    if (interaction.user.id !== authorId) {
      interaction.reply({
        content: "This isn't your thanks to undo!",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const thanksInteraction =
      await ThanksInteraction.findOne({
        responseMsgId: msgId,
      });

    if (!thanksInteraction) {
      interaction.editReply({
        content: 'something went wrong',
      });
      return;
    }
    const removeThankees: string[] = interaction.isButton()
      ? [thankeeId]
      : interaction.values;

    const thankees = await HelpfulRoleMember.find({
      user: {
        $in: removeThankees,
      },
      guild: thanksInteraction.guild,
    });

    await Promise.all(
      thankees.map(user => {
        user.points--;
        return user.save();
      })
    );

    thanksInteraction.thankees = [
      ...difference(thanksInteraction.thankees, removeThankees),
    ];
    const guild = client.guilds.resolve(thanksInteraction.guild);

    const textChannel = (await guild.channels.fetch(
      thanksInteraction.channel
    )) as TextChannel;
    if (thanksInteraction.thankees.length === 0) {
      textChannel.messages.delete(thanksInteraction.responseMsgId);
      ThanksInteraction.deleteOne({ _id: thanksInteraction._id })
    } else {
      const oldMsg = await textChannel.messages.fetch(msgId);
      const updatedEmbeds = [
        new EmbedBuilder(
          oldMsg.embeds[0]
        ).setFields(
          oldMsg.embeds[0].fields
            .filter(item => !removeThankees.includes(item.value.slice(3, -1)))
            .map((item, x) => ({ ...item, name: `${x + 1}` }))
        ),
        ...oldMsg.embeds.slice(1)
      ]


      const oldSelect = oldMsg.components[0].components[0];
      if (oldSelect.type !== ComponentType.StringSelect) throw new Error()
      const nuOptions = oldSelect.options
        .filter(item => !removeThankees.includes(item.value))
        .map(({ label, value }) => ({ label, value }));

      oldMsg.edit({
        embeds: updatedEmbeds,
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new StringSelectMenuBuilder(oldSelect)
              .setOptions(nuOptions)
              .setMaxValues(nuOptions.length)
          ),
        ],
      });
      thanksInteraction.save();
    }
    interaction.editReply({
      content: `Your thanks was revoked from ${listFormatter.format(
        removeThankees.map(x => `<@${x}>`)
      )}`,
    });
  });
}

export { handleThanks, attachUndoThanksListener };
