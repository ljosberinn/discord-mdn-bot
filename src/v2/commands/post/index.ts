import {
  Message,
  CollectorFilter,
  TextChannel,
  DMChannel,
  NewsChannel,
  Guild,
  Client,
  ThreadChannel,
  CommandInteraction,
  ButtonStyle,
} from 'discord.js';
import { ButtonBuilder, MessageActionRowComponentBuilder } from 'discord.js';
import { ActionRowBuilder } from 'discord.js';
import { filter } from 'domyno';

import type { CommandDataWithHandler } from '../../../types';
import { SERVER_ID } from '../../env.js';
import { cache } from '../../spam_filter/index.js';
import { MultistepForm } from '../../utils/MultistepForm.js';
import { asyncCatch } from '../../utils/asyncCatch.js';
import {
  createEmbed,
  createMarkdownCodeBlock,
} from '../../utils/discordTools.js';
import { map } from '../../utils/map.js';
import { pipe } from '../../utils/pipe.js';
import { capitalize } from '../../utils/string.js';
import {
  AWAIT_MESSAGE_TIMEOUT,
  JOB_POSTINGS_CHANNEL,
  POST_LIMITER,
  POST_LIMITER_IN_HOURS,
} from './env.js';
import { questions } from './questions.v2.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  weekday: 'long',
  day: '2-digit',
  year: 'numeric',
});

export type OutputField = {
  name: string;
  value: string;
  inline: boolean;
};

type Metadata = {
  username: string;
  discriminator: string;
  msgID?: string;
  userID?: string;
};

type Channel = TextChannel | NewsChannel | DMChannel;

type Answers = Map<string, string>;

type CacheEntry = {
  key: string;
  value: Date;
};

const getCurrentDate = () => {
  return dateFormatter.format(Date.now());
};

/*
  The `capitalize` function does **not** capitalize only one word in a string.
  It capitalizes all words present in the string itself, separated with a space.
*/

const getTargetChannel = (
  guild: Guild,
  name: string
): TextChannel | ThreadChannel =>
  guild.channels.cache.get(name) as TextChannel | ThreadChannel;

const generateURL = (guildID: string, channelID: string, msgID: string) =>
  `https://discordapp.com/channels/${guildID}/${channelID}/${msgID}`;

const getReply = async (
  channel: DMChannel,
  filter: CollectorFilter<[Message]>,
  timeMultiplier = 1
) => {
  try {
    const res = await channel.awaitMessages({
      filter,
      max: 1,
      time: AWAIT_MESSAGE_TIMEOUT * timeMultiplier,
    });

    const content = res.first().content.trim();

    return content.toLowerCase() === 'cancel' ? false : content; // Return false if the user explicitly cancels the form
  } catch {
    channel.send('You have timed out. Please try again.');
  }
};

const sendAlert = (
  guild: Guild,
  userInput: string,
  { username, discriminator }: Metadata
): void => {
  const targetChannel = getTargetChannel(guild, JOB_POSTINGS_CHANNEL);

  if (!targetChannel) {
    // eslint-disable-next-line no-console
    console.warn(
      'env.MOD_CHANNEL does not exist on this server - via post.sendAlert'
    );
    return;
  }

  const userTag = createUserTag(username, discriminator);

  try {
    targetChannel.send({
      embeds: [
        createEmbed({
          description:
            'A user attempted creating a job post whilst providing invalid compensation.',
          fields: [
            {
              inline: true,
              name: 'User',
              value: userTag,
            },
            {
              inline: false,
              name: 'Input',
              value: createMarkdownCodeBlock(userInput),
            },
            {
              inline: false,
              name: 'Command',
              value: createMarkdownCodeBlock(
                `?ban ${userTag} Invalid compensation.`
              ),
            },
            {
              inline: false,
              name: 'Message Link',
              value: 'DM Channel - Not Applicable.',
            },
          ],
          footerText: 'Job Posting Module',
          provider: 'spam',
          title: 'Alert!',
          url: 'https://discord.gg/',
        }).embed,
      ],
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('post.sendAlert', error);
  }
};

const generateFields = pipe<Answers, Iterable<OutputField>>([
  filter(
    ([key, val]: [string, string]) =>
      !['guidelines'].includes(key) &&
      !(key === 'remote' && val.toLowerCase() === 'onsite')
  ),
  map(([key, val]: [string, string]): OutputField => {
    let value = val;
    switch (key) {
      case 'compensation':
        value = val;
        break;
      case 'compensation_type':
        value = capitalize(val);
        break;
      case 'remote':
        value = val === 'remote' ? 'Yes' : 'No';
        break;
    }

    return {
      inline: false,
      name: capitalize(key.replace('_', ' ')),
      value: createMarkdownCodeBlock(value.replace(/```/gu, '')),
    };
  }),
]);

const createUserTag = (username: string, discriminator: string) =>
  `${username}#${discriminator}`;

const createJobPost = async (
  answers: Answers,
  guild: Guild,
  { username, discriminator, userID }: Metadata
) => {
  const targetChannel = getTargetChannel(guild, JOB_POSTINGS_CHANNEL);

  if (!targetChannel) {
    // eslint-disable-next-line no-console
    console.warn(
      'env.JOB_POSTINGS_CHANNEL does not exist on this server - via post.createJobPost'
    );
    return;
  }

  const user = createUserTag(username, discriminator);
  // const url = generateURL(guild.id, channelID, msgID);
  try {
    const msg = await targetChannel.send({
      content: `Job Poster: <@${userID}>`,
      embeds: [
        createEmbed({
          author: {
            name: user,
          },
          description: `A user has created a new job post!`,
          // Using the spam provider because we only need the color/icon, which it provides anyway
          fields: [
            {
              inline: true,
              name: 'Created On',
              value: getCurrentDate(),
            },
            ...generateFields(answers),
          ],

          footerText: 'Job Posting Module',

          provider: 'spam',

          title: 'New Job Post',
          // url, doesn't seem to serve a purpose due to !post messages no longer existing and also never really used anyway
        }).embed,
      ],
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`job🤔${userID}🤔response`)
            .setStyle(ButtonStyle.Primary)
            .setLabel('DM me the posting')
            .setEmoji('✉️'),
          new ButtonBuilder()
            .setCustomId(`job🤔${userID}🤔delete`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Delete my post (poster only)')
            .setEmoji('🗑')
        ),
      ],
    });

    return generateURL(guild.id, msg.channel.id, msg.id);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('post.createJobPost', error);
  }
};

const generateCacheEntry = (key: string): CacheEntry => ({
  key: `jp-${key}`, // JP stands for Job Posting, for the sake of key differentiation
  value: new Date(),
});

const calcNextPostingThreshold = (diff: number) => {
  if (diff === 0) {
    return 'in a bit';
  }

  return diff === 1 ? 'in an hour' : `in ${diff} hours`;
};

const handleJobPostingRequest = async (
  client: Client,
  interaction: CommandInteraction
): Promise<void> => {
  const { guild, member } = interaction;
  const { user: author } = interaction;
  const { username, discriminator, id } = author;

  const filter: CollectorFilter<[Message]> = m => m.author.id === id;
  const send = (str: string) => author.send(str);
  // Generate cache entry
  const entry = generateCacheEntry(id);

  try {
    // Check if the user has been cached
    const isCached = cache.get(entry.key);

    if (isCached) {
      const diff =
        Number.parseInt(POST_LIMITER_IN_HOURS) -
        Math.abs(Date.now() - entry.value.getTime()) / 3_600_000;

      interaction.reply({
        content: `You cannot create a job posting right now.\nPlease try again ${calcNextPostingThreshold(
          diff
        )}.`,
        ephemeral: true,
      });
      return;
    }
    cache.set(entry.key, entry.value, POST_LIMITER);

    await interaction.reply({
      content: `I've DMed you to start the process.`,
      ephemeral: true,
    });

    // Notify the user regarding the rules, and get the channel
    const channel = await author.createDM();

    const form = new MultistepForm(questions, channel, author);

    const answers = (await form.getResult('guidelines')) as unknown as Answers;

    console.log(answers);
    // Just return if the iteration breaks due to invalid input
    if (!answers) {
      cache.del(entry.key);
      return;
    }

    const url = await createJobPost(answers, guild, {
      discriminator,
      userID: id,
      username,
    });

    // Notify the user that the form is now complete
    await send(`Your job posting has been created!\n${url}`);

    // Store the job post in the cache
    cache.set(entry.key, entry.value, POST_LIMITER);
  } catch (error) {
    cache.del(entry.key);

    interaction.reply(
      'Please temporarily enable direct messages as the bot cares about your privacy.'
    );

    // eslint-disable-next-line no-console
    console.error('post.handleJobPostingRequest', error);
  }
};

export const jobPostCommand: CommandDataWithHandler = {
  name: 'post',
  description: 'Start the process of creating a new job post',
  handler: handleJobPostingRequest,
  guildValidate: guild => guild.id === SERVER_ID,
  onAttach: client => {
    client.on(
      'interactionCreate',
      asyncCatch(async interaction => {
        if (!interaction.isButton()) {
          return;
        }

        const [category, userId, type] = interaction.customId.split('🤔');

        if (category !== 'job') {
          return;
        }

        const message = await interaction.channel.messages.fetch(
          interaction.message.id
        );

        if (type === 'delete') {
          if (interaction.user.id !== userId) {
            interaction.reply({
              content: "You don't have permission to delete this post",
              ephemeral: true,
            });
            return;
          }

          await message.delete();

          interaction.reply({
            content: 'Your job post was deleted',
            ephemeral: true,
          });
        }

        if (type === 'response') {
          await interaction.deferReply({ ephemeral: true });
          const dmChannel = await interaction.user.createDM();
          try {
            dmChannel.send({
              content: `The user you want to DM is <@!${userId}>. The job posting can be found here: ${message.url}.\nA copy of the job posting is below for reference as well`,
              embeds: message.embeds,
            });
            interaction.editReply({
              content: 'Please check your dms',
              components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                  new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/channels/@me/${dmChannel.id}`)
                    .setLabel('Go to DMs')
                ),
              ],
            });
          } catch {
            interaction.editReply(
              `I tried to send you a DM but your DMs appear to be off. Heres the user you wish to DM <@${userId}>. If that doesn't work, please enable your DMs and try again.`
            );
          }
        }
      })
    );
  },
};
