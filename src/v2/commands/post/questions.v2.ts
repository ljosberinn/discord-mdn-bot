import { ButtonStyle } from 'discord.js';
import { MultistepForm, MultiStepFormStep } from '../../utils/MultistepForm.js';
import { createMarkdownCodeBlock } from '../../utils/discordTools.js';
import {
  MINIMAL_COMPENSATION,
  MINIMAL_AMOUNT_OF_WORDS,
  POST_LIMITER_IN_HOURS,
} from './env.js';

const isNotEmpty = (str: string): boolean => str.replace(/\W+/u, '').length > 0;
const isNotTooLong = length => (str: string) => {
  const isLessThan1000 = str.length < length;
  if (!isLessThan1000) {
    return `Your message is ${str.length} characters long, the limit is ${length} characters, please shorten your input`;
  }
  return true;
};
const and =
  <T, K>(...fns: ((input: T) => K)[]) =>
    (input: T): K | true => {
      for (const fn of fns) {
        const item: unknown = fn(input);
        if (item !== true) {
          return item as K;
        }
      }
      return true;
    };
const dollarFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
/*
  Since checking if the input string is empty is not practical for this use-case,
  this function checks if the provided input has at the very least `MINIMAL_AMOUNT_OF_WORDS` words in it.
*/
const isNotShort = (str: string): boolean =>
  str.split(' ').length >= MINIMAL_AMOUNT_OF_WORDS;

const greeterMessage =
  `Please adhere to the following guidelines when creating a job posting:
  ${createMarkdownCodeBlock(
    `
    1. Your job must provide monetary compensation.\n
    2. Your job must not be related to cryptocurrency, blockchain, NFTs, Web3 technologies, or gambling in any way.\n
    3. Your job must provide at least $${MINIMAL_COMPENSATION} in compensation.\n
    4. You can only post a job once every ${Number.parseInt(POST_LIMITER_IN_HOURS, 10) === 1
      ? 'hour'
      : `${POST_LIMITER_IN_HOURS} hours`
    }.\n
    5. You agree not to abuse our job posting service or circumvent any server rules, and you understand that doing so will result in a ban.\n`,
    'md'
  )}
  To continue, have the following information available:
  ${createMarkdownCodeBlock(
    `
  1. Job location information (optional).\n
  2. A short description of the job posting with no special formatting (at least ${MINIMAL_AMOUNT_OF_WORDS} words long).\n
  3. The amount of compensation in USD for the job.\n
  4. Contact information for potential job seekers to apply for your job.`,
    'md'
  )}
  If your compensation is deemed unfair by the moderation team, your job posting will be removed.`
    .split('\n')
    .map(item => item.trim())
    .join('\n');

export const questions = {
  guidelines: {
    type: 'button',
    body: greeterMessage,
    buttons: [
      { label: 'I Agree', value: 'ok', style: ButtonStyle.Success },
      { label: 'Cancel', value: 'cancel', style: ButtonStyle.Danger },
    ],
    buttonDelay: 5000,
    next: value => (value === 'ok' ? 'remote' : MultistepForm.cancelled),
  },
  remote: {
    type: 'button',
    body: 'Is this position remote or on-site?',
    buttons: [
      {
        label: 'Remote',
        value: 'remote',
      },
      {
        label: 'On-site',
        value: 'onsite',
      },
    ],
    next: (value: string): string =>
      value === 'onsite' ? 'location' : 'description',
  },
  location: {
    type: 'text',
    body: 'Provide the location in a single message. If you wish not to share the location reply with `no`.',
    validate: and<string, string | boolean>(isNotEmpty, isNotTooLong(30)),
    next: (value: string): string => 'description',
  },
  description: {
    type: 'text',
    body: 'With a single message provide a short description of the job.\nTypically job postings include a description of the job, estimated hours, technical knowledge requirements, scope, and desired qualifications.',
    validate: and<string, string | boolean>(isNotShort, isNotTooLong(1000)),
    next: (value: string): string => 'compensation_type',
  },
  compensation_type: {
    type: 'button',
    body: 'Type `project` if your compensation amount is for the project or type `hourly` if your compensation amount is for an hourly rate.',
    buttons: [
      {
        label: 'Project',
        value: 'project',
      },
      {
        label: 'Hourly',
        value: 'hourly',
      },
      {
        label: 'Salary',
        value: 'salary',
      },
    ],
    next: (value: string): string => 'compensation',
  },
  compensation: {
    type: 'text',
    body: 'Provide the compensation amount for this job using **only** numbers.',
    validate: (answer: string): boolean | string => {
      const value = Number(answer.split('$').join(''));
      const minimalCompensation = Number.parseFloat(MINIMAL_COMPENSATION);

      if (Number.isNaN(value)) {
        return `\`${answer}\` could not be parsed as a number`;
      }

      if (value < minimalCompensation) {
        return `The minimum compensation is ${dollarFormat.format(
          minimalCompensation
        )}.`;
      }

      return true;
    },
    format: (value: string): string =>
      dollarFormat.format(Number.parseFloat(value.split('$').join(''))),
    next: () => 'contact',
  },
  contact: {
    type: 'text',
    body: 'Provide the method that applicants should apply for your job (e.g., DM, email, website application, etc.) and any additional information that you think would be helpful to potential applicants.',
    validate: and<string, string | boolean>(isNotEmpty, isNotTooLong(100)),
  },
} as const satisfies Record<string, MultiStepFormStep>;
