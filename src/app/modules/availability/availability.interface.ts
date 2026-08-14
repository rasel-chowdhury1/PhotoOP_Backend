import { Model, Types } from 'mongoose';

export const WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type TWeekDay = (typeof WEEK_DAYS)[number];

export type TTimeSlot = {
  _id?: Types.ObjectId;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
};

export type TDayAvailability = {
  day: TWeekDay;
  isAvailable: boolean;
  slots: TTimeSlot[];
};


export interface TAvailability {
  user: Types.ObjectId;
  weeklySchedule: TDayAvailability[];
}

export type AvailabilityModel = Model<TAvailability>;
