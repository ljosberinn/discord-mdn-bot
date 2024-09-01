import type { User } from '@sentry/types';
import { formatDistanceToNow } from 'date-fns';
import {
  EmbedField,
  Client,
  CommandInteraction,
  ButtonInteraction,
  ComponentType,
  ApplicationCommandOptionType,
  StringSelectMenuInteraction,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import {
  EmbedBuilder,
  Collection,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { collect, take } from 'domyno';
import { URL } from 'url';

import type { CommandDataWithHandler } from '../../../types';
import { clampLengthMiddle, clampLength } from '../../utils/clampStr.js';
import {
  createMarkdownLink,
  createMarkdownBash,
} from '../../utils/discordTools.js';
import { website, language } from '../../utils/emojis.js';
import { unknownError } from '../../utils/errors.js';
import { map } from '../../utils/map.js';
import { pipe } from '../../utils/pipe.js';
import { getData } from '../../utils/urlTools.js';
import type { NPMResponse } from './types';

const provider = 'npm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const list = new (Intl as any).ListFormat();

const fetch: typeof getData = getData;
const formatDateFromNow: typeof formatDistanceToNow = formatDistanceToNow;

const getFirstTenResults = pipe<Iterable<NPMResponse>, NPMEmbed[]>([
  take<NPMResponse>(10),
  map(({ name, date, description, links, publisher, maintainers }) => ({
    author: {
      name: publisher.username,
      // icon_url: publisher.avatars.small,
      url: `https://www.npmjs.com/~${publisher.username}`,
    },
    description,
    externalUrls: {
      homepage: links.homepage,
      repository: links.repository,
    },
    lastUpdate: `${formatDateFromNow(new Date(date))} ago`,
    maintainers: maintainers.length,
    name,
    url: links.npm,
  })),
  collect,
]);

// msg: Message, searchTerm: string
const handleNpmCommand = async (
  client: Client,
  interaction: CommandInteraction
): Promise<void> => {
  const searchTerm = interaction.options.get('name').value as string;
  await interaction.deferReply({ ephemeral: true });
  try {
    const json = await fetch<NPMResponse[]>({
      isInvalidData: (json: unknown[]) => json.length === 0,
      msg: interaction,
      provider,
      searchTerm,
    });

    if (!json) {
      return;
    }

    const firstTenResults = getFirstTenResults(json);

    if (firstTenResults.length === 1) {
      await interaction.channel.send({
        content: `Displaying result for ${searchTerm}`,
        embeds: [createNPMEmbed(firstTenResults[0], interaction.user)],
      });
      await interaction.editReply('👇 Displaying results below');
      return;
    }

    const msgId = Math.random().toString(16);
    const collection = new Collection(
      firstTenResults.map(item => [item.url, item])
    );
    const selectRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`npm🤔${msgId}🤔select`)
        .setPlaceholder('Pick one option to display')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          firstTenResults.map(({ name, description, url }) => ({
            label: clampLengthMiddle(name, 25),
            description: clampLength(description, 50),
            value: url,
          }))
        )
    );

    const int = (await interaction.editReply({
      content: 'Please pick 1 option below to display',
      components: [selectRow],
    }))

    const interactionCollector = int.createMessageComponentCollector<
      ComponentType.Button | ComponentType.StringSelect
    >({
      filter: item =>
        item.user.id === interaction.user.id &&
        item.customId.startsWith(`npm🤔${msgId}`),
    });

    interactionCollector.once(
      'collect',
      async (interaction: ButtonInteraction | StringSelectMenuInteraction) => {
        await interaction.deferUpdate();
        if (interaction.isButton()) {
          return;
        }
        const valueSet = new Set(interaction.values);
        const values = collection.filter((_, key) => valueSet.has(key));

        await interaction.editReply({
          content: `Displaying Results for ${list.format(
            values.map(({ name }) => name)
          )}`,
          components: [],
        });

        interaction.channel.send({
          content: `Results for "${searchTerm}"`,
          embeds: values.map(npmEmbed =>
            createNPMEmbed(npmEmbed, interaction.user)
          ),
        });
      }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    if (interaction.replied) {
      try {
        await interaction.reply(unknownError);
      } catch {
        await interaction.editReply(unknownError);
      }
    }
  }
};

type NPMEmbed = {
  externalUrls: { homepage: string; repository: string };
  name: string;
  url: string;
  description: string;
  lastUpdate: string;
  maintainers: number;
  author: { name: string; url: string };
};

const createNPMEmbed = (
  {
    externalUrls,
    name,
    url,
    description,
    lastUpdate,
    maintainers,
    author,
  }: NPMEmbed,
  user: User
): EmbedBuilder =>
  new EmbedBuilder()
    .setAuthor({ name: `📦 Last updated ${lastUpdate}` })
    .setTitle(`${name}`)
    .setThumbnail(
      'https://static.npmjs.com/338e4905a2684ca96e08c7780fc68412.png'
    )
    .setDescription(
      description
        .split('\n')
        .map(item => item.trim())
        .join(' ')
    )
    .addFields(...createFields(name, externalUrls, maintainers), {
      name: 'Author',
      value: author.name,
      inline: true,
    })
    .setURL(url)
    .setFooter(
      {
        text: `requested by ${user.username}`,
        iconURL: user.avatarURL({ size: 64, format: 'webp' })
      }
    )
    .setColor(0xcb_37_37);

/**
 *  Creates fields for all links except npm since that ones in the title already
 *
 */
const createFields = (
  name: string,
  externalUrls: { homepage: string; repository: string },
  maintainers: number
): EmbedField[] => [
    {
      inline: false,
      name: 'How to install',
      value: createMarkdownBash(
        [`npm install ${name}`, '# Or', `yarn add ${name}`].join('\n')
      ),
    },
    ...Object.entries(externalUrls)
      .filter(([, url]) => !!url)
      .map(([host, url]) => {
        const markdownTitle = sanitizePackageLink(host, url);

        const emoji = host === 'homepage' ? website : false;

        return {
          inline: true,
          name: emoji ? `${emoji} ${host}` : host,
          value: createMarkdownLink(
            markdownTitle.endsWith('/')
              ? markdownTitle.slice(0, Math.max(0, markdownTitle.length - 1))
              : markdownTitle,
            url
          ),
        };
      }),
    {
      inline: true,
      name: `${language} maintainers`,
      value: maintainers.toString(),
    },
  ];

const sanitizePackageLink = (host: string, link: string) => {
  const { protocol, pathname } = new URL(link);

  if (host === 'homepage') {
    return link.replace(`${protocol}//`, '');
  }

  if (host === 'repository') {
    return pathname.startsWith('/') ? pathname.slice(1) : pathname;
  }

  return link;
};

export const npmInteraction: CommandDataWithHandler = {
  description: 'Search npm for a given package',
  name: 'npm',
  options: [
    {
      name: 'name',
      description: 'The name of the package',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
  handler: handleNpmCommand,
};
