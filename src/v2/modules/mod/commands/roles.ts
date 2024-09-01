import { ButtonStyle, CommandInteraction, MessageActionRowComponentBuilder } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';
import { chunk } from 'domyno';

import { map } from '../../../utils/map.js';
import { pipe } from '../../../utils/pipe.js';
import { NOTIFY_ROLES } from '../../roles/consts/notifyRoles.js';
import { ROLES } from '../../roles/consts/roles.js';

const generateButtons = (roles: typeof ROLES | typeof NOTIFY_ROLES) =>
  roles.map(item =>
    new ButtonBuilder()
      .setCustomId(`roles🤔toggle🤔${item.name}`)
      .setLabel(item.name)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(item.emoji)
  );
const chunkAndRowify = pipe<
  Iterable<ButtonBuilder>,
  Iterable<ActionRowBuilder<MessageActionRowComponentBuilder>>
>([
  chunk(5),
  map((buttonBuilders: ButtonBuilder[]) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttonBuilders))
]);

export async function setupRoles(
  interaction: CommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  interaction.channel.send({
    content:
      'You will need embeds enabled to interact with several features in this server.',
    embeds: [
      new EmbedBuilder()
        .setTitle('Assign Yourself Roles Below')
        .setDescription(
          `Click on the reaction that corresponds with the role you're interested in.`
        )
        .setColor('Green'),
      new EmbedBuilder()
        .setColor('Green')
        .setTitle('⭐ IMPORTANT: Access Role-Locked Channels')
        .setDescription(
          'In order to see any general channel, you must have at least one role from the list below (excluding Community Announcement roles). If you would like access to a technology-specific channel, you must add that role to your profile. Add as many roles as you like.'
        ),
      new EmbedBuilder()
        .setColor('Yellow')
        .setDescription(
          `:warning: Note: You can add and remove roles faster using the \`/roles change\` command`
        ),
    ],
    components: [
      ...chunkAndRowify([
        ...generateButtons(ROLES),
        new ButtonBuilder()
          .setCustomId('roles🤔toggle🤔All Development')
          .setLabel('All Channels')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🤓'),
      ]),
    ],
  });

  await interaction.channel.send({
    content:
      'We also have some roles for if you wish to be notified about various optional announcements, which you can opt into here:',
    components: [...chunkAndRowify(generateButtons(NOTIFY_ROLES))],
  });

  await interaction.editReply({
    content: 'Done.',
  });
}
