import {
  EmbedBuilder,
  Client,
  EmbedField,
  CommandInteraction,
  GuildMemberRoleManager,
  Interaction,
  ChatInputCommandInteraction,
  ApplicationCommandOptionType,
} from 'discord.js';
import type { GuildMember } from 'discord.js';

import type { CommandDataWithHandler } from '../../../types';
import {
  ADMIN_ROLE_ID,
  MOD_ROLE_ID,
  HELPFUL_ROLE_ID,
  HELPFUL_ROLE_POINT_THRESHOLD,
  POINT_DECAY_TIMER,
  SERVER_ID,
} from '../../env.js';
import type { IUser } from '../../helpful_role';
import HelpfulRoleMember from '../../helpful_role/db_model.js';
import { getTimeDiffToDecay } from '../../helpful_role/point_decay.js';
import { createEmbed } from '../../utils/discordTools.js';
import { _ } from '../../utils/pluralize.js';
import { some } from '../../utils/some.js';
import type { OutputField } from '../post';

const LEADERBOARD_LIMIT = 20;

const HELPFUL_ROLE_POINT_THRESHOLD_NUM = Number.parseInt(
  HELPFUL_ROLE_POINT_THRESHOLD
);

const getPoints = async (userID: string, guild: string) => {
  const user: IUser = await HelpfulRoleMember.findOne({
    guild,
    user: userID,
  });

  return user?.points ?? 0;
};

const setPoints = async (
  guild: string,
  member: GuildMember,
  amount: string | number
): Promise<[] | [number, number]> => {
  const points =
    typeof amount === 'number' ? amount : Number.parseInt(amount) ?? 0;

  if (Number.isNaN(points)) {
    return [];
  }

  const helpfulUser: IUser = await HelpfulRoleMember.findOne({
    guild,
    user: member.user.id,
  });
  if (helpfulUser) {
    const oldPoints = helpfulUser.points;
    const currPoints = points;
    helpfulUser.points = points;
    await helpfulUser.save();
    return [oldPoints, currPoints];
  }
  return [];
};

const isModOrAdmin = some(id => id === ADMIN_ROLE_ID || id === MOD_ROLE_ID);

const rolesArray = (roles: string[] | GuildMemberRoleManager) =>
  Array.isArray(roles) ? roles : roles.cache.map(role => role.id);

async function handlePoints(
  client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const isAdmin = isModOrAdmin(rolesArray(interaction.member.roles));
  await interaction.deferReply();

  switch (interaction.options.getSubcommand()) {
    case 'get': {
      const user = interaction.options.getUser('user') ?? interaction.user;

      const { username, id } = user;
      await handlePointsGet(id, interaction, username, isAdmin);
      return;
    }
    case 'set': {
      if (!isAdmin) {
        interaction.editReply({
          content: 'You do not have permission to use this command',
        });
        return;
      }
      const member: GuildMember = interaction.options.getMember(
        'user'
      ) as GuildMember;
      const points: number = interaction.options.getInteger('value');

      await handlePointsSet(client, interaction, member, points);
      return;
    }
    case 'reset': {
      if (!isAdmin) {
        interaction.editReply({
          content: 'You do not have permission to use this command',
        });
        return;
      }
      const member = interaction.options.getMember('user') as GuildMember;

      await handlePointsReset(interaction, member, client);

      return;
    }
    case 'leaderboard': {
      await handleLeaderboards(interaction);
      return;
    }
    case 'decay': {
      await handleDecayRequest(interaction);
      return;
    }
    default:
      console.error('Something went wrong');
      break;
  }
  interaction.deferReply();
}

const handleDecayRequest = async (interaction: CommandInteraction) => {
  const { diff } = await getTimeDiffToDecay();
  const timer = Number.parseInt(POINT_DECAY_TIMER);

  let [hours, minutes]: (string | number)[] = (timer - diff)
    .toString()
    .split('.');

  hours = Number.parseInt(hours);
  minutes = Math.floor((Number.parseInt(minutes.slice(0, 2)) * 60) / 100);

  const hoursTxt = hours === 0 ? '' : _`${_.n} hour${_.s}`(hours);
  const minutesTxt = minutes === 0 ? '' : _`${_.n} minute${_.s}`(minutes);

  const description = _`The point decay will occur in ${[
    hoursTxt,
    minutesTxt,
  ].filter(Boolean)}.`(0);

  await interaction.editReply({
    embeds: [
      createEmbed({
        description,
        footerText: 'Point Decay System',
        provider: 'spam',
        title: 'Point Decay Status',
      }).embed,
    ],
  });
};

async function handlePointsGet(
  userId: string,
  interaction: CommandInteraction,
  userName: string,
  isAdmin: boolean
) {
  const points = await getPoints(userId, interaction.guildId);

  if (!userId && isAdmin) {
    interaction.reply({
      embeds: [
        createPointCheckEmbed(userName, `The provided user ID is invalid.`),
      ],
    });
  }

  interaction.editReply({
    embeds: [
      createPointCheckEmbed(
        userName,
        `${isAdmin ? 'The user has' : 'You have'} accumulated ${points} point${points === 1 ? '' : 's'
        }.`,
        isAdmin ? undefined : 'Helpful User Points'
      ),
    ],
  });
}

async function handlePointsReset(
  interaction: CommandInteraction,
  member: GuildMember,
  client: Client
) {
  const result = await setPoints(interaction.guildId, member, 0);

  if (result.length === 0) {
    interaction.editReply({
      embeds: [
        createPointsEmbed(
          `The provided ID: "${member.user.id}" is not bound to any user.`,
          [adminEmbedField(interaction, true)]
        ),
      ],
    });
    return;
  }

  await member.roles.remove(HELPFUL_ROLE_ID);

  const embed = createPointsEmbed(`${member.user}'s points have been reset.`, [
    adminEmbedField(interaction, true),
  ]);

  interaction.editReply({ embeds: [embed] });
}

function adminEmbedField(
  interaction: CommandInteraction,
  inline = false
): EmbedField {
  return {
    inline,
    name: 'Admin/Moderator',
    value: `<@!${interaction.member.user.id}>`,
  };
}

async function handlePointsSet(
  client: Client,
  interaction: CommandInteraction,
  guildMember: GuildMember,
  points: number
) {
  const { member, guildId } = interaction;

  if (!member) {
    interaction.editReply({
      content: `User was invalid. (Not sure how that happened)`,
    });
    return;
  }

  const result = await setPoints(guildId, guildMember, points);

  if (result.length === 0) {
    interaction.editReply({
      content:
        'Invalid argument provided for the points parameter.\nUsage example: ```' +
        '!points set @user 10' +
        '```',
    });
    return;
  }

  const [prev, curr] = result;
  const output = createPointsEmbed(
    `A user's points have been set to ${points}`,
    [
      {
        inline: false,
        name: 'User',
        value: `${guildMember.user}`,
      },
      adminEmbedField(interaction),
    ]
  );

  if (
    prev >= HELPFUL_ROLE_POINT_THRESHOLD_NUM &&
    curr < HELPFUL_ROLE_POINT_THRESHOLD_NUM
  ) {
    await guildMember.roles.remove(HELPFUL_ROLE_ID);
    output.addFields({
      inline: false,
      name: '⚠ Role Change',
      value: '❌ Helpful Revoked',
    });
  } else if (
    prev < HELPFUL_ROLE_POINT_THRESHOLD_NUM &&
    curr > HELPFUL_ROLE_POINT_THRESHOLD_NUM
  ) {
    await guildMember.roles.add(HELPFUL_ROLE_ID);
    output.addFields({
      inline: false,
      name: '⚠ Role Change',
      value: '✅ Helpful Granted',
    });
  }

  interaction.editReply({ embeds: [output] });
}

function createPointCheckEmbed(
  userName: string,
  description: string,
  footerText = 'Admin: Points Handler'
): EmbedBuilder {
  return createEmbed({
    description,
    footerText,
    provider: 'spam',
    title: `Points check for ${userName}`,
  }).embed;
}

function createPointsEmbed(
  description: string,
  fields: EmbedField[] = []
): EmbedBuilder {
  return createEmbed({
    description,
    fields,
    footerText: 'Admin: Points Handler',
    provider: 'spam',
    title: 'Points Handler',
  }).embed;
}

async function handleLeaderboards(
  interaction: CommandInteraction
): Promise<void> {
  try {
    const topUsers: IUser[] =
      LEADERBOARD_LIMIT > 0
        ? [
          ...(await HelpfulRoleMember.find({ guild: interaction.guild.id })
            .sort({ points: -1 })
            .limit(LEADERBOARD_LIMIT)),
        ]
        : [];

    const fields: OutputField[] = topUsers.map(
      ({ user, points }, i): OutputField => {
        return {
          inline: false,
          name: `${i + 1}.`,
          value: `<@!${user}>: ${points} point${points === 1 ? '' : 's'}.`,
        };
      }
    );

    const output = createEmbed({
      description: `${fields.length > 0 ? 'Top helpful users:' : 'No users found.'
        }`,
      fields,
      footerText: 'Leaderboard: Helpful Users',
      provider: 'spam',
      title: 'Leaderboard: Helpful Users',
    });

    interaction.editReply({
      embeds: [output.embed],
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('catch -> leaderboard/index.ts', error);
  }
}

export const pointsHandlers: CommandDataWithHandler = {
  description: 'point commands',
  handler: handlePoints,
  name: 'points',
  guildValidate: guild => guild.id === SERVER_ID,
  options: [
    {
      name: 'leaderboard',
      description: `Display the points leaderboard, showing the top ${LEADERBOARD_LIMIT} users`,
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'get',
      description: 'Get points of a user',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionType.User,
          description: 'The user to get points for (Mod/Admins only)',
        },
      ],
    },
    {
      name: 'set',
      description: 'Set points of user (Mod/Admin only)',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionType.User,
          description: 'The user to set points for (Mod/Admins only)',
          required: true,
        },
        {
          name: 'value',
          type: ApplicationCommandOptionType.Integer,
          description: 'Number of points to set the user to have',
          required: true,
        },
      ],
    },
    {
      name: 'reset',
      description: 'Set points of user (Mod/Admin only)',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionType.User,
          description: 'The user to reset points for (Mod/Admins only)',
          required: true,
        },
      ],
    },
    {
      name: 'decay',
      description: 'See how long till the next points decay.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],
};
