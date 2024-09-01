import { ButtonStyle, CommandInteraction, GuildMember } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, MessageActionRowComponentBuilder } from 'discord.js';

export async function suggest(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply({});

  const member = interaction.member as GuildMember;
  const user = interaction.options.get('user').user;
  const role = interaction.options.get('role', true).value as string;

  interaction.editReply({
    content: `Hey${user ? ` ${user}` : ''
      }, ${member.toString()} is suggesting that you join the ${role} role.`,
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel(`Join ${role} Role`)
          .setCustomId(`roles🤔add🤔${role}`)
          .setStyle(ButtonStyle.Primary)
      ),
    ],
  });
}
