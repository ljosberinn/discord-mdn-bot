import type {
  ChatInputApplicationCommandData,
  ChatInputCommandInteraction,
  Client,
  CommandInteraction,
  Guild,
} from 'discord.js';

export type CommandDataWithHandler = ChatInputApplicationCommandData & {
  handler: (client: Client, interaction: ChatInputCommandInteraction) => Promise<void>;
  onAttach?: (client: Client) => void;
  guildValidate?: (guild: Guild) => boolean;
};
