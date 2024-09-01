import { ActionRowBuilder, MessageActionRowComponentBuilder, RoleSelectMenuBuilder } from 'discord.js';

export function generateRoleSelect(
  placeholder: string,
  customId: string,
  roles: string[]
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setDefaultRoles(...roles)
      .setCustomId(customId)
      .setMinValues(1)
      .setPlaceholder(placeholder)
  );
}
