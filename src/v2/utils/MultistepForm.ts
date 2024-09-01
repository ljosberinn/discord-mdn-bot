/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageActionRowComponentBuilder,
  type ButtonInteraction,
  type DMChannel,
  type Message,
  type MessageActionRowComponentResolvable,
  type PartialMessage,
  type TextChannel,
  type ThreadChannel,
  type User,
} from 'discord.js';

import { AWAIT_MESSAGE_TIMEOUT } from '../../env.js';
import { DeferredPromise } from './DeferredPromise.js';

export type QuestionBase = {
  body: string;
  next?: (value: unknown, state: unknown) => string | undefined | symbol;
};

export type ButtonQuestion = {
  type: 'button';
  buttons: readonly {
    label: string;
    value: string;
    style?: ButtonStyle;
  }[];
  buttonDelay?: number;
} & QuestionBase;

export type TextQuestion = {
  type: 'text';
  validate?: (input: string) => boolean | string;
  format?: (input: string) => string;
} & QuestionBase;

export type MultiStepFormStep = ButtonQuestion | TextQuestion;

const __cancelled__ = Symbol('cancelled');

export class MultistepForm<T extends Record<string, MultiStepFormStep>> {
  static cancelled = __cancelled__;

  #steps: T;

  #id: string = Math.random().toString(16);

  #channel: TextChannel | DMChannel | ThreadChannel;

  #user: User;

  public constructor(
    steps: Readonly<T>,
    channel: TextChannel | DMChannel | ThreadChannel,
    user: User
  ) {
    this.#steps = steps;
    this.#channel = channel;
    this.#user = user;
  }

  public async getButtonResponse<P extends ButtonQuestion>(
    step: P
  ): Promise<P['buttons'][number]['value'] | typeof __cancelled__> {
    const resolver = new DeferredPromise<
      P['buttons'][number]['value'] | typeof __cancelled__
    >();
    const message = await this.#channel.send({
      content: `**${step.body}**`,
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(...this.genButtons<P>(step, !!step.buttonDelay))

      ],
    });

    if (step.buttonDelay) {
      setTimeout(() => {
        message.edit({
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>()
              .setComponents(...this.genButtons<P>(step))
          ],
        });
      }, step.buttonDelay);
    }

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: interaction => interaction.user.id === this.#user.id,
    });

    const handler = async (interaction: ButtonInteraction) => {
      if (interaction.isButton()) {
        const [id, value] = interaction.customId.split('🤔');

        if (id !== this.#id) {
          return;
        }

        collector.stop('id matched');
        await interaction.deferUpdate();
        interaction.editReply({
          content: `**${step.body}**\n${step.buttons.find(({ value: val }) => val === value).label
            }`,
          components: [],
        });
        resolver.resolve(value);
      }
    };

    collector.on('collect', handler);
    setTimeout(() => {
      if (resolver.settled) {
        return;
      }

      collector.stop('cancelled');
      resolver.resolve(__cancelled__);
      message.edit({
        components: [],
      });
      message.channel.send('Timed out. Please restart the process.');
    }, Number(AWAIT_MESSAGE_TIMEOUT) * 1000);
    return resolver;
  }

  public async getTextResponse<P extends TextQuestion>(
    step: P
  ): Promise<string | typeof __cancelled__> {
    const message = await this.sendWithCancel(
      `**${step.body}**\n\nOr click below to cancel.`
    );

    const deleteResolver = new DeferredPromise<typeof __cancelled__>();

    const handleDelete = (msg: Message | PartialMessage) => {
      if (msg.id !== message.id) {
        return;
      }

      this.#channel.client.off('messageDelete', handleDelete);
      deleteResolver.resolve(__cancelled__);
    };

    this.#channel.client.on('messageDelete', handleDelete);

    try {
      const userId = this.#user.id;
      const res = await Promise.race([
        this.#channel.awaitMessages({
          time: Number.parseInt(AWAIT_MESSAGE_TIMEOUT) * 1000,
          filter: message => {
            const value = step.validate(message.cleanContent);
            const fromUser = message.author.id === userId;

            if (typeof value === 'string' && fromUser) {
              this.#channel.send(value);
            }

            return fromUser && typeof value === 'boolean' && value;
          },
          max: 1,
        }),
        deleteResolver,
      ]);

      // cleanup
      this.#channel.client.off('messageDelete', handleDelete);

      if (res === __cancelled__) {
        return __cancelled__;
      }

      const value = res.first().content.trim();
      return step.format?.(value) ?? value;
    } catch {
      this.#channel.send(`You have timed out. Please try again`);
      return __cancelled__;
    }
  }

  public async getResult(startStep: keyof T): Promise<Map<keyof T, unknown>> {
    let currentStep: keyof T | typeof __cancelled__ = startStep;

    const state: Map<keyof T, unknown> = new Map();

    while (
      currentStep !== undefined &&
      currentStep !== __cancelled__ &&
      currentStep in this.#steps
    ) {
      const step = this.#steps[currentStep];
      let value;
      if (step.type === 'button') {
        value = await this.getButtonResponse(step);
        if (value === __cancelled__) {
          return null;
        }
        state.set(currentStep, value);
      } else {
        value = await this.getTextResponse(step);
        if (value === __cancelled__) {
          return null;
        }
        state.set(currentStep, value);
      }

      currentStep = step?.next?.(value, state);
    }
    return currentStep === __cancelled__ ? null : state;
  }

  private genButtons<P extends ButtonQuestion>(
    step: P,
    disabled?: boolean
  ): ButtonBuilder[] {
    return step.buttons.map(
      (button) => new ButtonBuilder()
        .setLabel(button.label)
        .setStyle(button.style ?? ButtonStyle.Primary)
        .setCustomId(`${this.#id}🤔${button.value}`)
        .setDisabled(disabled ?? false)
    );
  }

  private async sendWithCancel(content: string): Promise<Message> {
    const messageId = Math.random().toString(16);

    const message = await this.#channel.send({
      content,
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>()
          .setComponents(
            new ButtonBuilder()
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Danger)
              .setCustomId(`${this.#id}🤔${messageId}`)
          )

      ],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: interaction => interaction.user.id === this.#user.id,
    });

    const handler = (interaction: ButtonInteraction) => {
      if (interaction.isButton()) {
        const [id, cancelId] = interaction.customId.split('🤔');
        // console.log({id, cancelId, selfId: this.#id, message})
        if (messageId !== cancelId || id !== this.#id) {
          return;
        }
        collector.stop('cancelled');
        message.delete();
        message.channel.send('Cancelled');
      }
    };

    collector.on('collect', handler);

    return message;
  }
}
