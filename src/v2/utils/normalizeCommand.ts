import {
  ApplicationCommandChannelOptionData,
  ApplicationCommandChoicesData,
  ApplicationCommandData,
  ApplicationCommandNonOptionsData,
  ApplicationCommandOptionData,
  ApplicationCommandOptionType,
  ApplicationCommandSubCommandData,
  ApplicationCommandSubGroupData,
  ApplicationCommandType,
  PermissionsBitField,
} from 'discord.js';

export function normalizeApplicationCommandData<
  T extends ApplicationCommandData
>(cmd: T): T {
  if (!('type' in cmd) || cmd.type === ApplicationCommandType.ChatInput) {
    return {
      ...cmd,
      type: 'CHAT_INPUT',
      defaultPermission: cmd.defaultMemberPermissions ?? PermissionsBitField.Default,
      options: (cmd.options ?? []).map(normalizeApplicationOptionData),
    };
  }
  return { ...cmd };
}

function normalizeApplicationOptionData<
  T extends
  | ApplicationCommandOptionData
  | ApplicationCommandSubCommandData
  | ApplicationCommandSubGroupData
  | ApplicationCommandNonOptionsData
  | ApplicationCommandChoicesData
  | ApplicationCommandChannelOptionData
>(option: T): T {
  if (option.type === ApplicationCommandOptionType.Subcommand) {
    return {
      ...option,
      options: (option.options ?? []).map(normalizeApplicationOptionData),
      required: (option as unknown as { required: boolean }).required ?? false,
    };
  }

  if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
    return {
      ...option,
      options: (option.options ?? []).map(normalizeApplicationOptionData),
      required: (option as unknown as { required: boolean }).required ?? false,
    };
  }

  return {
    ...option,
    required: (option as unknown as { required: boolean }).required ?? false,
  };
}
