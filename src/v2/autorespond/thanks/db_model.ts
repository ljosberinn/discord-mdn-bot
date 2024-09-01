import { Schema, model } from 'mongoose';


const schema = new Schema<ThanksInteractionType>(
  {
    guild: {
      required: true,
      type: String,
    },
    channel: {
      required: true,
      type: String,
    },
    thanker: {
      required: true,
      type: String,
    },
    thankees: {
      type: [String],
      required: true,
    },
    responseMsgId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const ThanksInteraction = model<ThanksInteractionType>(
  'thanksMessageInteraction',
  schema
);
export type ThanksInteractionType = {
  guild: string;
  thanker: string;
  channel: string;
  thankees: string[];
  responseMsgId: string;
  createdAt: Date;
  updatedAt: Date;
};
