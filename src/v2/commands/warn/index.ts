import { ApplicationCommandOptionType, Client, CommandInteraction } from 'discord.js';
import Fuse, { FuseResult } from 'fuse.js';

import type { CommandDataWithHandler } from '../../../types';
import { asyncCatch } from '../../utils/asyncCatch.js';
import { pluckʹ } from '../../utils/pluck.js';
import { _ } from '../../utils/pluralize.js';

const listFormatter = new Intl.ListFormat();
const rulesId = '904060678699089950';

const rules = [
  'Disrespectful',
  'Breaking Discord TOS',
  'Inppropriate Channel',
  'NSFW',
  'Spam',
  'Self promotion',
  'Doxxing',
  'Unsolicited DMs',
  'Inappropriate Username',
  'Attempted Mass pinging',
  'Academic dishonesty',
  'Shortened Urls',
  'Uploading code',
  'DM Rule Avoidance',
].map((item, index) => ({ name: item, value: String(index + 1) }));
const keywords = [];

const fuse = new Fuse(rules, {
  includeScore: true,
  keys: ['name', 'value'],
});

export const warn: CommandDataWithHandler = {
  description: 'Quick response for common "why no" or "why not..." questions',
  handler: async (
    client: Client,
    interaction: CommandInteraction
  ): Promise<void> => {
    const user = interaction.options.get('user').user;
    const rules = (interaction.options.get('rules').value as string).split('|');
    const reason = interaction.options.get('reason').value as string;

    const warnMessage = _`Rule${_.s} ${rules}. Please read the <#${rulesId}>. ${reason ?? ''
      }`;

    await interaction.reply(`Debug Received:
user: ${user}
rules: ${rules}
reason: ${reason}
warn msg: ${warnMessage(rules.length)}
    `);
  },
  onAttach(client) {
    client.on(
      'interactionCreate',
      asyncCatch(async interaction => {
        if (!interaction.isAutocomplete()) {
          return;
        }
        const result = interaction.options.getFocused();
        console.log(result);
        const resultsParts = result
          .split(/&| and |,|\|/giu)
          .filter(x => x.trim());
        if (resultsParts.length === 0) {
          return interaction.respond(rules);
        }
        const results = resultsParts
          .map(x => fuse.search(x))
          .filter(x => x.length);
        const perms = removeRepeated<{ value: string; name: string }>(
          permutations(results)
        );
        const values = perms.map(item => comb(item.map(x => x.item)));
        await interaction.respond(values);
      })
    );
  },
  name: 'warn',
  options: [
    {
      name: 'user',
      description: 'Person to warn',
      type: ApplicationCommandOptionType.User,
      required: true,
    },
    {
      name: 'rules',
      type: ApplicationCommandOptionType.String,
      description: 'What rule(s) is the user breaking',
      autocomplete: true,
      required: true,
    },
    {
      name: 'reason',
      type: ApplicationCommandOptionType.String,
      description: 'The reason the user is getting warned',
    },
  ],
};

function permutations<T>(items: T[][]) {
  if (items.length === 0) {
    return [];
  }
  const [item, ...rest] = items;
  if (rest.length === 0) {
    return item.map(x => [x]);
  }

  const latterPers = permutations(rest);

  return item.flatMap(item => latterPers.map(x => [item, ...x]));
}

function comb(items: { name: string; value: string }[]) {
  console.log(items);
  const names = [...pluckʹ(items, 'name')];
  const values = [...pluckʹ(items, 'value')];

  return {
    name: names.join(', '),
    value: values.join('|'),
  };
}

function removeRepeated<T>(arr: FuseResult<T>[][]) {
  console.log(arr);
  return arr.filter(x => {
    const s = new Set(x.map(i => i.refIndex));
    if (s.size !== x.length) {
      return false;
    }
    return true;
  });
}
