import { PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';

import {
  limits,
  type Campaign,
  type Channel,
  type Schema,
  type Segment,
  type SegmentOverlap,
} from '../model';
import { CAPS, OVERRIDE_REASON_MIN_CHARS } from './config';
import {
  checkCapBreaches,
  dayKey,
  evaluateAutoPause,
  evaluateWarmUp,
  expectedTouches,
  findCollisionPairs,
  quietHourViolations,
  throughputWarnings,
  type CollisionPair,
  type ExpectedTouchesResult,
  type QuietHourWave,
  type ThroughputOverlap,
  type WarmUpEvaluation,
} from './rules';

export interface MusicBoxWorkspace {
  segments: Segment[];
  overlaps: SegmentOverlap[];
  campaigns: Campaign[];
  now: Date;
}

export async function loadWorkspace(store: DataStore<Schema>, now: Date = new Date()): Promise<MusicBoxWorkspace> {
  const [segments, overlaps, campaigns] = await Promise.all([
    store.repo('Segment').list(),
    store.repo('SegmentOverlap').list(),
    store.repo('Campaign').list(),
  ]);
  campaigns.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  return { segments, overlaps, campaigns, now };
}

export interface ScheduleCampaignInput {
  name: string;
  channel: Channel;
  segmentId: string;
  sendAt: string;
  audience: number;
  throttlePerHour: number;
  localTime: boolean;
  capOverrideReason?: string;
  /** If true and cap is breached by non-admin, saves as draft awaiting lead override. */
  submitForOverride?: boolean;
}

export interface ScheduleCampaignResult {
  created: Campaign[];
  warmUp: WarmUpEvaluation;
  capBreaches: ExpectedTouchesResult[];
  awaitingOverride: boolean;
}

/**
 * Schedule a campaign pin on the music-box cylinder.
 * - Enforces Rule 2 (SMS quiet hours 08:00-21:00 local).
 * - Enforces Rule 1 (Expected touches <= CAPS[channel] unless lead approves 20+ char override).
 * - Enforces Rule 4 (Warm-up: splits > 2x recent max volume into 3 waves 2h apart).
 */
export async function scheduleCampaign(
  store: DataStore<Schema>,
  actor: Person,
  input: ScheduleCampaignInput,
  now: Date = new Date(),
): Promise<ScheduleCampaignResult> {
  const name = input.name.trim();
  if (name.length < limits.campaignName.min || name.length > limits.campaignName.max) {
    throw new RuleError(`Campaign name must be ${limits.campaignName.min}–${limits.campaignName.max} characters.`);
  }
  if (input.audience <= 0 || input.throttlePerHour <= 0) {
    throw new RuleError('Audience and hourly throttle must be positive numbers.');
  }

  // Rule 2: Quiet hours
  const violations = quietHourViolations(input.sendAt, input.channel, input.localTime);
  if (violations.length > 0) {
    const first = violations[0];
    throw new RuleError(
      `Quiet-hour violation: SMS wave hits ${first.zoneLabel} at ${first.localTimeLabel} (outside 08:00–21:00 local). Shift the send time.`,
    );
  }

  const [segments, overlaps, campaigns] = await Promise.all([
    store.repo('Segment').list(),
    store.repo('SegmentOverlap').list(),
    store.repo('Campaign').list(),
  ]);

  const seg = segments.find((s) => s.id === input.segmentId);
  if (!seg) throw new RuleError('Select a valid audience segment.');

  // Rule 1: Expected touches cap check
  const capBreaches = checkCapBreaches(
    { channel: input.channel, segmentId: input.segmentId, sendAt: input.sendAt },
    campaigns,
    segments,
    overlaps,
  );

  const cleanReason = input.capOverrideReason?.trim() ?? '';
  let awaitingOverride = false;
  let approvedBySub: string | null = null;
  let approvedByName: string | null = null;

  if (capBreaches.length > 0) {
    const worst = capBreaches[0];
    const worstName = segments.find((s) => s.id === worst.segmentId)?.name ?? 'segment';
    if (cleanReason.length < OVERRIDE_REASON_MIN_CHARS) {
      throw new RuleError(
        `Cap exceeded: ${worstName} would reach ${worst.touches.toFixed(1)} expected ${input.channel} touches (cap ${CAPS[input.channel]}). A Messaging lead override requires a reason of ${OVERRIDE_REASON_MIN_CHARS}+ characters.`,
      );
    }
    if (actor.isAdmin) {
      approvedBySub = actor.sub;
      approvedByName = actor.displayName;
    } else if (input.submitForOverride) {
      awaitingOverride = true;
    } else {
      throw new PermissionError(
        `Cap exceeded (${worst.touches.toFixed(1)} > ${CAPS[input.channel]}). Submit for Messaging lead override approval.`,
      );
    }
  }

  // Rule 4: Warm-up spike splitting
  const warmUp = evaluateWarmUp(input.audience, input.channel, input.sendAt, campaigns, now);
  const waveGroup = warmUp.needsWarmUp ? `wv-${Date.now().toString(36)}` : null;

  const created: Campaign[] = [];
  for (const w of warmUp.waves) {
    const waveName = warmUp.needsWarmUp ? `${name} (Wave ${w.waveIndex}/3)` : name;
    const row = await store.repo('Campaign').create({
      name: waveName.slice(0, limits.campaignName.max),
      channel: input.channel,
      segmentId: input.segmentId,
      sendAt: w.sendAt,
      audience: w.audience,
      throttlePerHour: input.throttlePerHour,
      localTime: input.localTime,
      status: awaitingOverride ? 'draft' : 'scheduled',
      delivered: 0,
      unsubs: 0,
      capOverrideReason: capBreaches.length > 0 ? cleanReason.slice(0, limits.overrideReason.max) : null,
      approvedBySub,
      approvedByName,
      waveGroup,
      waveIndex: warmUp.needsWarmUp ? w.waveIndex : null,
      ownerSub: actor.sub,
      ownerName: actor.displayName,
    });
    created.push(row);
  }

  return { created, warmUp, capBreaches, awaitingOverride };
}

/**
 * Messaging lead approves a cap override on a draft campaign (requires 20+ char reason).
 */
export async function approveCapOverride(
  store: DataStore<Schema>,
  actor: Person,
  campaignId: string,
  reason?: string,
): Promise<Campaign> {
  if (!actor.isAdmin) {
    throw new PermissionError('Only the Messaging lead can approve fatigue cap overrides.');
  }
  const target = await store.repo('Campaign').get(campaignId);
  if (!target) throw new RuleError('Campaign not found.');

  const finalReason = (reason ?? target.capOverrideReason ?? '').trim();
  if (finalReason.length < OVERRIDE_REASON_MIN_CHARS) {
    throw new RuleError(`Cap override requires a reason of at least ${OVERRIDE_REASON_MIN_CHARS} characters.`);
  }

  const violations = quietHourViolations(target.sendAt, target.channel, target.localTime);
  if (violations.length > 0) {
    throw new RuleError(
      `Cannot approve while SMS quiet-hour violation (${violations[0].localTimeLabel} ${violations[0].zoneLabel}) remains.`,
    );
  }

  return store.repo('Campaign').update(target.id, {
    status: 'scheduled',
    capOverrideReason: finalReason.slice(0, limits.overrideReason.max),
    approvedBySub: actor.sub,
    approvedByName: actor.displayName,
  });
}

/**
 * Record delivery & unsubscribe counts; triggers Rule 5 auto-pause if rate >= PAUSE_UNSUB after MIN_DELIVERED.
 */
export async function recordDeliveryMetrics(
  store: DataStore<Schema>,
  _actor: Person,
  campaignId: string,
  delivered: number,
  unsubs: number,
): Promise<{ record: Campaign; autoPaused: boolean }> {
  const target = await store.repo('Campaign').get(campaignId);
  if (!target) throw new RuleError('Campaign not found.');
  if (delivered < 0 || unsubs < 0 || unsubs > delivered) {
    throw new RuleError('Unsubscribes must be between 0 and delivered count.');
  }

  const check = evaluateAutoPause(delivered, unsubs, target.channel);
  const nextStatus = check.shouldPause ? 'paused' : target.status;

  const record = await store.repo('Campaign').update(target.id, {
    delivered,
    unsubs,
    status: nextStatus,
  });

  return { record, autoPaused: check.shouldPause };
}

/**
 * Pause a campaign (Messaging lead or campaign owner).
 */
export async function pauseCampaign(
  store: DataStore<Schema>,
  actor: Person,
  campaignId: string,
): Promise<Campaign> {
  const target = await store.repo('Campaign').get(campaignId);
  if (!target) throw new RuleError('Campaign not found.');
  if (!actor.isAdmin && target.ownerSub !== actor.sub) {
    throw new PermissionError('Only the campaign owner or Messaging lead can pause this campaign.');
  }
  return store.repo('Campaign').update(target.id, { status: 'paused' });
}

/**
 * Resume a paused campaign — strictly Messaging lead only (Rule 5 / AC4).
 */
export async function resumeCampaign(
  store: DataStore<Schema>,
  actor: Person,
  campaignId: string,
): Promise<Campaign> {
  if (!actor.isAdmin) {
    throw new PermissionError('Only the Messaging lead can resume a paused campaign.');
  }
  const target = await store.repo('Campaign').get(campaignId);
  if (!target) throw new RuleError('Campaign not found.');
  if (target.status !== 'paused') {
    throw new RuleError('Only paused campaigns can be resumed.');
  }
  return store.repo('Campaign').update(target.id, { status: 'sending' });
}

/**
 * Update or create a SegmentOverlap entry in the Tuning Fork overlap matrix editor.
 */
export async function upsertOverlap(
  store: DataStore<Schema>,
  actor: Person,
  segmentA: string,
  segmentB: string,
  sharedCount: number,
): Promise<SegmentOverlap> {
  if (segmentA === segmentB) throw new RuleError('Overlap must link two distinct segments.');
  const segments = await store.repo('Segment').list();
  const sA = segments.find((s) => s.id === segmentA);
  const sB = segments.find((s) => s.id === segmentB);
  if (!sA || !sB) throw new RuleError('Segment not found.');
  const maxShared = Math.min(sA.size, sB.size);
  if (sharedCount < 0 || sharedCount > maxShared) {
    throw new RuleError(`Shared count must be between 0 and ${maxShared.toLocaleString()}.`);
  }

  const all = await store.repo('SegmentOverlap').list();
  const existing = all.find(
    (o) =>
      (o.segmentA === segmentA && o.segmentB === segmentB) ||
      (o.segmentA === segmentB && o.segmentB === segmentA),
  );
  if (existing) {
    return store.repo('SegmentOverlap').update(existing.id, { sharedCount });
  }
  return store.repo('SegmentOverlap').create({
    segmentA,
    segmentB,
    sharedCount,
    ownerSub: actor.sub,
  });
}

/* ------------------------------------------------------------------ Enriched workspace view */

export interface EnrichedCampaign {
  campaign: Campaign;
  segment: Segment | undefined;
  expectedTouches: number;
  overCap: boolean;
  quietViolations: QuietHourWave[];
  unsubCheck: ReturnType<typeof evaluateAutoPause>;
  collidesWithIds: string[];
  awaitingOverride: boolean;
  needsWarmUpFlag: boolean;
}

export interface EnrichedSegment {
  segment: Segment;
  touchesByChannel: Record<Channel, ExpectedTouchesResult>;
  anyOverCap: boolean;
}

export interface EnrichedMusicBox {
  dayIso: string;
  segments: EnrichedSegment[];
  campaigns: EnrichedCampaign[];
  collisions: CollisionPair[];
  throughput: ThroughputOverlap[];
}

export function enrichWorkspace(ws: MusicBoxWorkspace): EnrichedMusicBox {
  const dayIso = dayKey(ws.now.toISOString());
  const segMap = new Map(ws.segments.map((s) => [s.id, s]));

  const enrichedSegments: EnrichedSegment[] = ws.segments.map((segment) => {
    const email = expectedTouches(segment, 'email', dayIso, ws.campaigns, ws.segments, ws.overlaps);
    const sms = expectedTouches(segment, 'sms', dayIso, ws.campaigns, ws.segments, ws.overlaps);
    const push = expectedTouches(segment, 'push', dayIso, ws.campaigns, ws.segments, ws.overlaps);
    return {
      segment,
      touchesByChannel: { email, sms, push },
      anyOverCap: email.overCap || sms.overCap || push.overCap,
    };
  });

  const collisions = findCollisionPairs(ws.campaigns, ws.segments, ws.overlaps);
  const collisionMap = new Map<string, string[]>();
  for (const p of collisions) {
    collisionMap.set(p.aId, [...(collisionMap.get(p.aId) ?? []), p.bId]);
    collisionMap.set(p.bId, [...(collisionMap.get(p.bId) ?? []), p.aId]);
  }

  const enrichedCampaigns: EnrichedCampaign[] = ws.campaigns.map((campaign) => {
    const segment = segMap.get(campaign.segmentId);
    const et = segment
      ? expectedTouches(segment, campaign.channel, campaign.sendAt, ws.campaigns, ws.segments, ws.overlaps)
      : null;
    const qv = quietHourViolations(campaign.sendAt, campaign.channel, campaign.localTime);
    const unsubCheck = evaluateAutoPause(campaign.delivered, campaign.unsubs, campaign.channel);
    const warmCheck = evaluateWarmUp(campaign.audience, campaign.channel, campaign.sendAt, ws.campaigns, ws.now);
    const awaitingOverride = campaign.status === 'draft' && Boolean(campaign.capOverrideReason) && !campaign.approvedBySub;
    return {
      campaign,
      segment,
      expectedTouches: et?.touches ?? 0,
      overCap: et?.overCap ?? false,
      quietViolations: qv,
      unsubCheck,
      collidesWithIds: collisionMap.get(campaign.id) ?? [],
      awaitingOverride,
      needsWarmUpFlag: campaign.status === 'draft' && !campaign.waveGroup && warmCheck.needsWarmUp,
    };
  });

  return {
    dayIso,
    segments: enrichedSegments,
    campaigns: enrichedCampaigns,
    collisions,
    throughput: throughputWarnings(ws.campaigns),
  };
}
