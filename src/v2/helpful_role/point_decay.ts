import type { EmbedField, TextChannel, Guild } from 'discord.js';

import { get, upsert } from '../cache/cacheFns.js';
import {
  POINT_DECAY_TIMER,
  MOD_CHANNEL,
  HELPFUL_ROLE_POINT_THRESHOLD,
  HELPFUL_ROLE_EXEMPT_ID,
  SERVER_ID,
  HELPFUL_ROLE_ID,
} from '../env.js';
import { createEmbed } from '../utils/discordTools.js';
import { capitalize } from '../utils/string.js';
import HelpfulRoleMember from './db_model.js';

import type { IUser } from '.';

type DecayCache = {
  type: 'POINT_DECAY';
  user: '';
  guild: string;
  meta: {
    lastDecay: number;
  };
};
const HOUR_IN_MS = 3_600_000;

let lastDecay;
let timeout;

export const decay = async ({
  guild,
  userId,
}: {
  guild: Guild;
  userId?: string;
}): Promise<void> => {
  try {
    console.log(guild)
    const users: IUser[] = await HelpfulRoleMember.find({
      guild: guild.id,
      points: {
        $gt: 0,
      },
    });

    for (const user of users) {
      const currentPoints = user.points ?? 0;
      const decay = Math.ceil(currentPoints / 100);
      const nextPoints = currentPoints - decay;

      user.points = nextPoints > 0 ? nextPoints : 0;

      // This isn't time sensitive and it's better for us to save some than none here
      // eslint-disable-next-line no-await-in-loop
      await user.save();

      const member = guild.members.cache.get(user.user);

      if (
        user.points < Number.parseInt(HELPFUL_ROLE_POINT_THRESHOLD) &&
        !member?.roles.cache.has(HELPFUL_ROLE_EXEMPT_ID)
      ) {
        member?.roles.remove(HELPFUL_ROLE_ID);
      }
    }

    const modChannel = guild.channels.cache.find(
      c => c.id === MOD_CHANNEL
    ) as TextChannel;

    const fields: EmbedField[] = [
      {
        inline: false,
        name: 'Forced?',
        value: capitalize(`${!!userId}`),
      },
      userId && {
        inline: false,
        name: 'Admin/Moderator',
        value: `<@!${userId}>`,
      },
    ].filter(Boolean);

    await modChannel.send({
      embeds: [
        createEmbed({
          description: `The point decay affected ${users.length} user${users.length === 1 ? '' : 's'
            }.`,
          fields,
          footerText: 'Point Decay System',
          provider: 'spam',
          title: 'Point Decay Alert',
        }).embed,
      ],
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('catch -> decay(msg):', error);
  }
};

export const getTimeDiffToDecay = async (): Promise<{
  diff: number;
  timestamp: number;
}> => {
  if (!lastDecay) {
    return new Promise(resolve => {
      setTimeout(async () => {
        resolve(await getTimeDiffToDecay());
      }, 500);
    });
  }

  const timestamp = Date.now();

  return {
    diff: (timestamp - lastDecay) / HOUR_IN_MS,
    timestamp,
  };
};

const pointDecaySystem = async (decayData: {
  guild: Guild;
  userId?: string;
}): Promise<void> => {
  const { diff, timestamp } = await getTimeDiffToDecay();
  const timer = Number.parseFloat(POINT_DECAY_TIMER);

  if (diff >= timer) {
    await saveLastDecay(timestamp);

    await decay(decayData);

    setDecayTimeout(
      decayData.guild,
      (Number.parseFloat(POINT_DECAY_TIMER) ?? 0.5) * HOUR_IN_MS
    );
  } else {
    setDecayTimeout(decayData.guild, (timer - diff) * HOUR_IN_MS);
  }
};

function setDecayTimeout(guild: Guild, ms: number) {
  clearTimeout(timeout);

  timeout = setTimeout(() => {
    pointDecaySystem({ guild });
  }, ms);
}

export default pointDecaySystem;

export const loadLastDecayFromDB = async (): Promise<void> => {
  const cache = (await get({
    type: 'POINT_DECAY',
    user: '',
    guild: SERVER_ID,
  })) as DecayCache;

  lastDecay = cache?.meta?.lastDecay ?? -1;
};

export const saveLastDecay = async (
  timestamp: number = Date.now()
): Promise<void> => {
  await upsert({
    expiresAt: Number.MAX_SAFE_INTEGER,
    guild: SERVER_ID,
    type: 'POINT_DECAY',
    user: '',
    meta: {
      lastDecay: timestamp,
    },
  });

  lastDecay = timestamp;
};
