import { ApplicationCommandOptionChoiceData, ApplicationCommandOptionType } from 'discord.js';

import type { CommandDataWithHandler } from '../../../types';
import {
  ADMIN_ROLE_ID,
  HELPFUL_ROLE_ID,
  MOD_ROLE_ID,
  SERVER_ID,
} from '../../env.js';
import { map } from '../../utils/map.js';
import type { ValueOrNullary } from '../../utils/valueOrCall.js';
import { valueOrCall } from '../../utils/valueOrCall.js';
import { flexbox } from '../about/handlers/flexbox.js';
import { lockfile } from '../about/handlers/lockfile.js';
import { modules } from '../about/handlers/modules.js';
import { vscode } from '../about/handlers/vscode.js';
import { code } from '../please/handlers/code.js';
import { format } from '../please/handlers/format/index.js';
import { jquery } from '../whyno/handlers/jquery.js';

const aboutMessages = new Map<string, ValueOrNullary<string>>([
  jquery,
  vscode,
  modules,
  format,
  code,
  flexbox,
  lockfile,
]);

const shitpostReplacements = {
  jquery: /jquery/giu,
  vscode: /visual studio code|vscode/giu,
  modules: /module/giu,
  sass: /sass|scss/giu,
  format: /code|sql/giu,
  code: /code/giu,
  flexbox: /flexbox/giu,
  lockfile: /lockfile|package|node/giu,
};

const mapTransformToChoices = map(
  (item: string): ApplicationCommandOptionChoiceData<string> => ({
    name: item,
    value: item,
  })
);

export const shitpostInteraction: CommandDataWithHandler = {
  description:
    'A fun little shitpost command using some of the about/please/whyno commands',
  guildValidate: guild => guild.id === SERVER_ID,
  handler: async (client, interaction) => {
    const topic = interaction.options.get('topic').value as string;
    const replacement = interaction.options.get('replacement').value as string;
    const content = aboutMessages.get(topic);
    const { roles } = interaction.member;

    if (canUseCommand(roles)) {
      await interaction.reply({
        ephemeral: true,
        content: 'This is only available to helpful members',
      });
      return;
    }

    if (/<@[!&]?\d+>/u.test(replacement)) {
      await interaction.reply({
        content: "Please don't try to tag users with this feature!",
        ephemeral: true,
      });
      return;
    }

    if (content) {
      const shitpostContent = valueOrCall(content).replace(
        shitpostReplacements[topic],
        replacement
      );
      interaction.reply(shitpostContent);
    }
  },
  name: 'shitpost',
  options: [
    {
      choices: [...mapTransformToChoices(aboutMessages.keys())],
      description: 'The topic to ask about',
      name: 'topic',
      required: true,
      type: ApplicationCommandOptionType.String,
    },
    {
      name: 'replacement',
      description: 'Replacement word to use',
      required: true,
      type: ApplicationCommandOptionType.String,
    },
  ],
};

function canUseCommand(roles) {
  if (Array.isArray(roles)) {
    if (
      ![HELPFUL_ROLE_ID, MOD_ROLE_ID, ADMIN_ROLE_ID].some(role =>
        roles.includes(role)
      )
    ) {
      return true;
    }
  } else {
    return ![HELPFUL_ROLE_ID, MOD_ROLE_ID, ADMIN_ROLE_ID].some(role =>
      roles.cache.has(HELPFUL_ROLE_ID)
    );
  }
  return false;
}
