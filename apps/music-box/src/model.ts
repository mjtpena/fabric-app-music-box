/**
 * App data types and runtime entity definitions. Mirrors rayfin/data/*.ts.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

export type Channel = 'email' | 'sms' | 'push';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused';

export const CHANNELS: readonly Channel[] = ['email', 'sms', 'push'] as const;
export const STATUSES: readonly CampaignStatus[] = ['draft', 'scheduled', 'sending', 'sent', 'paused'] as const;

export const limits = {
  segmentName: { min: 3, max: 60 },
  campaignName: { min: 3, max: 80 },
  overrideReason: { min: 20, max: 200 },
} as const;

export interface Segment {
  id: string;
  name: string;
  size: number;
  ownerSub: string;
}

export interface SegmentOverlap {
  id: string;
  segmentA: string;
  segmentB: string;
  sharedCount: number;
  ownerSub: string;
}

export interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  segmentId: string;
  sendAt: string;
  audience: number;
  throttlePerHour: number;
  localTime: boolean;
  status: CampaignStatus;
  delivered: number;
  unsubs: number;
  capOverrideReason: string | null;
  approvedBySub: string | null;
  approvedByName: string | null;
  waveGroup: string | null;
  waveIndex: number | null;
  ownerSub: string;
  ownerName: string;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  Segment: Segment;
  SegmentOverlap: SegmentOverlap;
  Campaign: Campaign;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  Segment: {
    name: 'Segment',
    fields: { id: 'uuid', name: 'text', size: 'int', ownerSub: 'text' },
  },
  SegmentOverlap: {
    name: 'SegmentOverlap',
    fields: { id: 'uuid', segmentA: 'uuid', segmentB: 'uuid', sharedCount: 'int', ownerSub: 'text' },
  },
  Campaign: {
    name: 'Campaign',
    fields: {
      id: 'uuid',
      name: 'text',
      channel: 'text',
      segmentId: 'uuid',
      sendAt: 'date',
      audience: 'int',
      throttlePerHour: 'int',
      localTime: 'bool',
      status: 'text',
      delivered: 'int',
      unsubs: 'int',
      capOverrideReason: 'text',
      approvedBySub: 'text',
      approvedByName: 'text',
      waveGroup: 'text',
      waveIndex: 'int',
      ownerSub: 'text',
      ownerName: 'text',
    },
  },
};
