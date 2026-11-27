import type { CampaignStatus, Channel } from '../model';

/**
 * All Music Box fatigue caps, quiet hours, warm-up, and auto-pause thresholds.
 */
export const CAPS: Record<Channel, number> = {
  email: 3,
  sms: 1,
  push: 2,
};

export const SMS_WINDOW = {
  startHour: 8,
  endHour: 21,
} as const;

export const SPIKE_FACTOR = 2;

export const PAUSE_UNSUB: Record<Channel, number> = {
  email: 0.005, // 0.5%
  sms: 0.01, // 1.0%
  push: 0.01, // 1.0%
};

export const MIN_DELIVERED = 2000;

export const WARM_STEPS = [0.25, 0.5, 1] as const;
export const WARM_WAVE_GAP_HOURS = 2;
export const OVERLAP_COLLISION_HOURS = 2;
export const OVERRIDE_REASON_MIN_CHARS = 20;

export const RECIPIENT_ZONES = [
  { id: 'ET', label: 'New York (UTC-5)', offsetHours: -5 },
  { id: 'CT', label: 'Chicago (UTC-6)', offsetHours: -6 },
  { id: 'MT', label: 'Denver (UTC-7)', offsetHours: -7 },
  { id: 'PT', label: 'Los Angeles (UTC-8)', offsetHours: -8 },
] as const;

export const CHANNEL_LABELS: Record<Channel, string> = {
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
};

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  paused: 'Paused',
};
