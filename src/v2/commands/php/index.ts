/* eslint-disable unicorn/prefer-query-selector */
import {
  ApplicationCommandOptionType,
  ButtonInteraction,
  ButtonStyle,
  Client,
  CommandInteraction,
  ComponentType,
  Message,
  MessageActionRowComponentBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { ButtonBuilder, ActionRowBuilder, StringSelectMenuBuilder, } from 'discord.js';
import type { Node } from 'dom-parser';
import DOMParser, { parseFromString } from 'dom-parser';
import { decode } from 'html-entities';

import type { CommandDataWithHandler } from '../../../types';
import { invalidResponse, unknownError } from '../../../v2/utils/errors.js';
import { clampLength, clampLengthMiddle } from '../../utils/clampStr.js';
import { buildDirectUrl, getSearchUrl } from '../../utils/urlTools.js';
import useData from '../../utils/useData.js';

const provider = 'php';

type ParseResult = {
  isDirect: boolean;
  results: DOMParser.Node[];
};

/**
 *
 * @param {any} result [document.parseFromString return type]
 */
const extractMetadataFromResult = (result: Node) => {
  const titleElement = result.textContent;

  const title = decode(titleElement);

  const url = buildDirectUrl(provider, result.getAttribute('href'));

  return {
    title,
    url,
  };
};

const textParser = (text: string): ParseResult => {
  const document = parseFromString(text);

  // Check if we were directed directly to the result.
  const isDirect = document.getElementById('quickref_functions') === null;
  if (isDirect) {
    return {
      isDirect,
      results: [],
    };
  }

  const results = document
    .getElementById('quickref_functions')
    .getElementsByTagName('li')
    .slice(0, 10);

  return {
    isDirect,
    results,
  };
};

const requester = async (
  searchTerm: string
): Promise<{ error: boolean; text: string; searchUrl: string }> => {
  const searchUrl = getSearchUrl(provider, searchTerm);
  const response = await useData(searchUrl, 'text');
  return {
    ...response,
    searchUrl,
  };
};

const makeRequest = requester;
const parseText = textParser;
const metadataExtractor = extractMetadataFromResult;

const handler = async (
  client: Client,
  interaction: CommandInteraction
): Promise<void> => {
  const searchTerm = interaction.options.get('query').value as string;
  const defer = interaction.deferReply();
  try {
    const { error, text, searchUrl } = await makeRequest(searchTerm);
    if (error) {
      await defer;
      await interaction.editReply(invalidResponse);
      return;
    }

    const { isDirect, results } = parseText(text);
    if (isDirect) {
      await defer;
      await interaction.editReply(buildDirectUrl(provider, searchTerm));
      return;
    }

    const msgId = Math.random().toString(16);

    const selectRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`php🤔${msgId}🤔select`)
        .setMaxValues(5)
        .setMinValues(1)
        .addOptions(
          results.map(({ firstChild: link }, index) => {
            const { title, url } = metadataExtractor(link);

            return {
              label: clampLengthMiddle(title, 25),
              description: clampLength(url, 50),
              value: String(index),
            };
          })
        )
    );

    const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId(`mdn🤔${msgId}🤔cancel`)
    );

    await defer;
    const int = (await interaction.editReply({
      content: 'Please pick 1 - 5 options below to display',
      components: [selectRow, buttonRow],
    }))

    const interactionCollector = int.createMessageComponentCollector<
      ComponentType.Button | ComponentType.StringSelect
    >({
      filter: item =>
        item.user.id === interaction.user.id &&
        item.customId.startsWith(`php🤔${msgId}`),
    });

    interactionCollector.once(
      'collect',
      async (interaction: ButtonInteraction | StringSelectMenuInteraction) => {
        await interaction.deferUpdate();
        if (interaction.isButton()) {
          await int.delete();
          return;
        }
        const urls = interaction.values.map(
          x => metadataExtractor(results[x].firstChild).url
        );

        await interaction.editReply({
          components: [],
          content: urls.join('\n'),
        });
      }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    await interaction.reply(unknownError);
  }
};

export const phpCommand: CommandDataWithHandler = {
  name: 'php',
  description: 'search and link something from php.net',
  handler,
  options: [
    {
      name: 'query',
      description: 'The search query for php',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
};
