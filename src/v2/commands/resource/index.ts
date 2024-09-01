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
import { javascript } from './handlers/javascript.js';

const resourceMessages = new Map<string, ValueOrNullary<{ content: string }>>([
  javascript,
]);

const mapTransformToChoices = map(
  (item: string): ApplicationCommandOptionChoiceData<string> => ({
    name: item,
    value: item,
  })
);

export const resourceInteraction: CommandDataWithHandler = {
  description: 'Quick response for asking someone to please use something',
  handler: async (client: Client, interaction: CommandInteraction) => {
    const content = resourceMessages.get(interaction.options.get('for').value as string);

    if (content) {
      interaction.reply(valueOrCall(content));
    }
  },
  name: 'resource',
  options: [
    {
      choices: [...mapTransformToChoices(resourceMessages.keys())],
      description: 'what are you looking to find resources for',
      name: 'for',
      required: true,
      type: ApplicationCommandOptionType.String,
    },
  ],
};
