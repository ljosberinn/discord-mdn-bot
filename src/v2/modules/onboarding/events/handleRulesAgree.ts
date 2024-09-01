import { ButtonStyle, GuildMember, Interaction, Message, MessageActionRowComponentBuilder } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, MessageComponentBuilder } from 'discord.js';

import { UserState } from '../db/user_state.js';
import { continueOnboarding } from '../utils/continueOnboarding.js';

export const handleRulesAgree = async (
  interaction: Interaction
): Promise<void> => {
  if (!interaction.isButton()) {
    return;
  }

  const [type, subType] = interaction.customId.split('🤔');
  if (type !== 'onboarding' || subType !== 'rules_agreed') {
    return;
  }

  const message = interaction.message as Message;

  await message.edit({
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Success)
          .setLabel(`You've agreed to the rules.`)
          .setCustomId('onboarding🤔rules_agreed')
          .setDisabled(true),
      ),
    ],
  });
  interaction.reply('Great! Just a couple more steps.');

  const oldState = await UserState.findOne({
    guild: interaction.guild.id,
    userId: interaction.user.id,
  });

  oldState.state = 'INTRODUCTION';
  oldState.rulesAgreedDate = new Date();
  await oldState.save();

  await message.unpin();

  continueOnboarding(
    interaction.guild,
    interaction.member as GuildMember,
    oldState
  );
};
