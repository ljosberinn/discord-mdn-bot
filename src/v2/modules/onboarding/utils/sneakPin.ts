import { Message, MessageType } from 'discord.js';

export const sneakPin = async (msg: Message): Promise<void> => {
  const awaitedPinned = msg.channel.awaitMessages({
    filter: msg => msg.type === MessageType.ChannelPinnedMessage,
    max: 1,
  });

  await msg.pin();

  const pinned = await awaitedPinned;
  await pinned.first().delete();
};
