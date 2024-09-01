import type {
  ButtonInteraction,
  GuildMember,
  Interaction,
  Role,
} from 'discord.js';

import { generateRoleSelect } from '../utils/generateRoleSelect.js';
import { getAddRemoveRoles } from '../utils/getAddRemoveRoles.js';

const listFormatter = new Intl.ListFormat();

async function toggle(interaction: ButtonInteraction, role: Role) {
  const member = interaction.member as GuildMember;
  const isAdd = !member.roles.resolve(role.id);
  if (isAdd) {
    await member.roles.add(role.id);
  } else {
    await member.roles.remove(role.id);
  }

  return interaction.reply({
    ephemeral: true,
    content: `I've ${isAdd ? 'added you to' : 'removed you from'} the ${role.name
      } role.`,
  });
}

export const handleAddRemoveRole = async (
  interaction: Interaction
): Promise<void> => {
  const member = interaction.member as GuildMember;
  if (!interaction.isButton() && !interaction.isSelectMenu()) {
    return;
  }

  const [type, subtype, role] = interaction.customId.split('🤔');
  if (type !== 'roles') {
    return;
  }

  const roleNames = new Set<string>(
    interaction.isButton() ? [role] : interaction.values
  );

  if (roleNames.size === 0) {
    return;
  }

  const roles = member.guild.roles.cache
    .filter(x => roleNames.has(x.name))
    .map(x => x);

  if (subtype === 'add') {
    await member.roles.add(roles);
  } else if (subtype === 'remove') {
    await member.roles.remove(roles);
  } else {
    toggle(interaction as ButtonInteraction, roles[0]);
    return
  }

  if (interaction.isStringSelectMenu()) {
    const [addRoles, removeRoles] = getAddRemoveRoles(
      interaction.member as GuildMember
    );

    interaction.update({
      content: `✅ You've been ${subtype === 'add' ? 'added to' : 'removed from'
        } ${listFormatter.format(roleNames)}`,
      components: [
        addRoles.length > 0 &&
        generateRoleSelect(
          'Which roles would you like to join?',
          'roles🤔add',
          addRoles
        ),
        removeRoles.length > 0 &&
        generateRoleSelect(
          'Which roles would you like to leave?',
          'roles🤔remove',
          removeRoles
        ),
      ].filter(Boolean),
    });
  } else {
    interaction.reply({
      ephemeral: true,
      content: `You've been ${subtype === 'add' ? 'added to' : 'removed from'
        } ${listFormatter.format(roleNames)}`,
    });
  }
};
