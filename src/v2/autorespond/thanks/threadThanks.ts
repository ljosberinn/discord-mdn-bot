import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  Client,
  CommandInteraction,
  Message,
  ThreadMember,
  UserSelectMenuInteraction,
} from 'discord.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  MessageActionRowComponentBuilder,
  RoleSelectMenuBuilder,
} from 'discord.js';

import { POINT_LIMITER_IN_MINUTES } from '../../env.js';
import { asyncCatch } from '../../utils/asyncCatch.js';
import { _ } from '../../utils/pluralize.js';
import { createResponse } from './createResponse.js';
import type { ThanksInteractionType } from './db_model.js';
import { ThanksInteraction } from './db_model.js';

const memoryCache = new Map<string, Message>();

export async function handleThreadThanks(msg: Message): Promise<void> {
  const { channel, author, id: msgId } = msg;
  if (!channel.isThread()) {
    return;
  }

  const oldResponseId = [author.id, channel.id].join('|');
  if (memoryCache.has(oldResponseId)) {
    await memoryCache
      .get(oldResponseId)
      .delete()
      .catch(error => {
        console.error('message already deleted');
      })
      .finally(() => {
        memoryCache.delete(oldResponseId);
      });
  }
  // channel.members.fetch should return a collection
  const [members, previousInteractions]: [
    Collection<string, ThreadMember>,
    ThanksInteractionType[]
  ] = await Promise.all([
    channel.members.fetch({ cache: false }),
    ThanksInteraction.find({
      thanker: author.id,
      createdAt: {
        $gte: Date.now() - Number.parseInt(POINT_LIMITER_IN_MINUTES) * 60_000,
      },
    }),
  ]);
  const previouslyThankedIds = new Set(
    previousInteractions.flatMap(x => x.thankees)
  );
  const alreadyThanked = [];

  const otherMembers = members.filter(x => {
    const notSelf = x.user.id !== author.id;
    const notBot = !x.user.bot;
    const notTimeout = !previouslyThankedIds.has(x.user.id);

    if (!notTimeout) {
      alreadyThanked.push(x);
    }

    return notSelf && notBot && notTimeout;
  });

  if (otherMembers.size === 0) {
    return;
  }

  const response = await msg.reply({
    content: [
      "Hey, it looks like you're trying to thank one or many users, but haven't specified who. Who would you like to thank?",
      alreadyThanked.length > 0
        ? _`There ${_.mapper({ 1: 'is' }, 'are')} **${_.n} user${_.s
          } that you can't thank as you've thanked them recently**, so they won't show up as an option.`(
            alreadyThanked.length
          )
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setDefaultRoles(
            ...otherMembers.keys()
          )
          .setMinValues(1)
          .setCustomId(`threadThanks🤔${msgId}🤔select🤔${author.id}`)
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Nevermind')
          .setStyle(ButtonStyle.Secondary)
          .setCustomId(`threadThanks🤔${msgId}🤔cancel🤔${author.id}`)
      ),
    ],
  });

  if (channel?.id) {
    memoryCache.set([author.id, channel.id].join('|'), response);
  }
}

export function attachThreadThanksHandler(client: Client): void {
  client.on(
    'interactionCreate',
    asyncCatch(async interaction => {
      if (!(interaction.isAnySelectMenu() || interaction.isButton())) {
        return;
      }
      const { channel, customId, user, message, guild } = interaction;
      const [category, msgId, type, userId] = customId.split('🤔');

      if (category !== 'threadThanks') {
        return;
      }
      if (user.id !== userId) {
        interaction.reply({
          content: "That's not for you! That prompt is for someone else.",
          ephemeral: true,
        });
        return;
      }

      if (type === 'cancel') {
        await Promise.all([
          channel.messages.delete(message.id),
          interaction.reply({
            content: 'Sure thing, message removed!',
            ephemeral: true,
          }),
        ]);
        return;
      }

      if (type === 'select') {
        const { values } = interaction as UserSelectMenuInteraction;
        channel.messages.delete(message.id);
        const msgPromise = channel.messages.fetch(msgId);
        const thankedMembers = await guild.members.fetch({
          user: values,
        });

        const thankedUsers = new Collection(
          thankedMembers.map(item => [item.user.id, item.user])
        );

        const responseData = createResponse(thankedUsers, user.id);
        let response: Message;

        const msg = await msgPromise;
        if (msg) {
          response = await msg.reply(responseData);
        } else {
          response = await msg.channel.send(responseData);
        }

        const name = [channel.id, user.id].join('|');
        if (memoryCache.has(name)) {
          const item = memoryCache.get(name);
          memoryCache.delete(name);
          await item.delete();
        }

        if (channel.isThread() && channel.ownerId === user.id) {
          sendCloseThreadQuery(interaction);
        }

        await ThanksInteraction.create({
          thanker: userId,
          guild: guild.id,
          channel: channel.id,
          thankees: thankedUsers.map(u => u.id),
          responseMsgId: response.id,
        });
      }
    })
  );
}

function sendCloseThreadQuery(
  interaction: AnySelectMenuInteraction | ButtonInteraction | CommandInteraction
) {
  interaction.reply({
    content: 'Would you like to archive this thread and mark it as resolved?',
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Primary)
          .setLabel('Yes please!')
          .setCustomId(`closeThread🤔${interaction.channel.id}🤔close`)
      ),
    ],
    ephemeral: true,
  });
}

export function attachThreadClose(client: Client): void {
  client.on(
    'interactionCreate',
    asyncCatch(async interaction => {
      if (!interaction.isButton()) {
        return;
      }
      const id = interaction.customId;
      const msgId = interaction.message.id;
      const [type, channelId, thankeeId] = id.split('🤔');
      if (type !== 'closeThread') {
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const activeThreads =
        await interaction.guild.channels.fetchActiveThreads();

      const channel = activeThreads.threads.get(channelId);

      if (!channel || channel.archived) {
        interaction.reply({ content: '' });
      }

      await interaction.editReply({
        content: 'Closed!',
      });
      await channel.setName(`✅ ${channel.name}`);
      await channel.setArchived(true, 'Resolved!');
    })
  );
}
