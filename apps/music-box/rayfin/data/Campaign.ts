import { boolean, date, entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A scheduled, sending, sent, or paused messaging campaign (one pin on the cylinder).
 * Row security: owners create/update/delete their own rows; pause/resume and cap overrides
 * are enforced for the Messaging lead in domain functions.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', ['create', 'update', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.ownerSub),
})
export class Campaign {
  @uuid() id!: string;
  @text({ min: 3, max: 80 }) name!: string;
  @set('email', 'sms', 'push') channel!: 'email' | 'sms' | 'push';
  @uuid() segmentId!: string;
  @date() sendAt!: Date;
  @int() audience!: number;
  @int() throttlePerHour!: number;
  @boolean() localTime!: boolean;
  @set('draft', 'scheduled', 'sending', 'sent', 'paused')
  status!: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused';
  @int() delivered!: number;
  @int() unsubs!: number;
  @text({ max: 200, optional: true }) capOverrideReason?: string;
  @text({ max: 100, optional: true }) approvedBySub?: string;
  @text({ max: 100, optional: true }) approvedByName?: string;
  @text({ max: 40, optional: true }) waveGroup?: string;
  @int({ optional: true }) waveIndex?: number;
  @text({ min: 1, max: 100 }) ownerSub!: string;
  @text({ min: 1, max: 100 }) ownerName!: string;
}
