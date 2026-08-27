export const USER_ROLE = {
  ADMIN: 'admin',
  USER: 'user',
  SNAPPER: 'snapper',
} as const;

export const gender = ['Male', 'Female', 'Others'] as const;
export const Role = Object.values(USER_ROLE);

export const specialties = [
  'Portraits',
  'Events',
  'Nature',
  'Travel',
  'Lifestyle',
  'Sports',
] as const;

export const approvalStatuses = ['pending', 'approved', 'rejected'] as const;

export const userStatuses = ['active', 'inactive', 'suspended'] as const;

export const days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export enum Login_With {
  google = 'google',
  apple = 'apple',
  facebook = 'facebook',
  credentials = 'credentials',
}
