import { ActionRowBuilder, ButtonBuilder, ComponentType, GuildMember, Interaction, Message, MessageActionRowComponent, MessageActionRowComponentBuilder } from 'discord.js';

import { UserState } from '../db/user_state.js';
import { continueOnboarding } from '../utils/continueOnboarding.js';

export const handleNotifyRolesSelected = async (
  interaction: Interaction
): Promise<void> => {
  if (!interaction.isSelectMenu()) {
    return;
  }

  const [type, subType] = interaction.customId.split('🤔');
  if (type !== 'onboarding' || subType !== 'notify_roles') {
    return;
  }

  const message = interaction.message as Message;
  const member = interaction.member as GuildMember;
  const picked = new Set(interaction.values);

  const { guild, user } = interaction;

  const pickedRoles = guild.roles.cache.filter(x => picked.has(x.name));

  member.roles.add(pickedRoles);
  interaction.reply({
    content: `:loudspeaker: I've given you the roles to notify you about ${new Intl.ListFormat().format(
      [...pickedRoles.values()].map(x => x.name)
    )}`,
  });
  const msg = interaction.message as Message;

  msg.edit({
    components: msg.components.map(component => {
      if (component.type === ComponentType.ActionRow) {
        return new ActionRowBuilder<MessageActionRowComponentBuilder>(component)
          .setComponents(...component.components.map(x => {
            if (x.type === ComponentType.Button) {
              return new ButtonBuilder(x).setDisabled(true)
            }
            return x as unknown as MessageActionRowComponentBuilder
          }))
      }

      return component
    }),
  });

  const oldState = await UserState.findOne({
    guild: guild.id,
    userId: user.id,
  });

  if (oldState.state !== 'ONBOARDED') {
    oldState.state = 'ONBOARDED';
    await oldState.save();

    await message.unpin();

    continueOnboarding(guild, member, oldState);
  }
};
