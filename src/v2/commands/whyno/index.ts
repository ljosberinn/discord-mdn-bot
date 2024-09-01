import {
  ApplicationCommandOptionChoiceData,
  ApplicationCommandOptionType,
  Client,
  CommandInteraction,
} from 'discord.js';

import { CommandDataWithHandler } from '../../../types';
import { map } from '../../utils/map.js';
import { ValueOrNullary } from '../../utils/valueOrCall.js';
import { valueOrCall } from '../../utils/valueOrCall.js';
import { channel } from './handlers/channel.js';
import { jquery } from './handlers/jquery.js';

const whynoMessages = new Map<string, ValueOrNullary<string>>([
  jquery,
  channel,
]);

const mapTransformToChoices = map(
  (item: string): ApplicationCommandOptionChoiceData<string> => ({
    name: item,
    value: item,
  })
);

export const whynoInteraction: CommandDataWithHandler = {
  description: 'Quick response for common "why no" or "why not..." questions',
  handler: async (
    client: Client,
    interaction: CommandInteraction
  ): Promise<void> => {
    const topic = interaction.options.get('topic').value as string;
    const user = interaction.options.get('tag').user;
    const content = whynoMessages.get(topic);

    if (content) {
      interaction.reply(
        `${user ? `${user.toString()}\n` : ''} ${valueOrCall(content).trim()}`
      );
      return;
    }

    interaction.reply(`An error occured when trying to call \`/whyno ${topic}`);
  },
  name: 'whyno',
  options: [
    {
      choices: [...mapTransformToChoices(whynoMessages.keys())],
      description: 'The topic in question',
      name: 'topic',
      required: true,
      type: ApplicationCommandOptionType.String,
    },
    {
      name: 'tag',
      description: 'Optional Person to Tag',
      type: ApplicationCommandOptionType.User,
    },
  ],
};
