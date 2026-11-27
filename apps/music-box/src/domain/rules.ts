import type { Campaign, Channel, Segment, SegmentOverlap } from '../model';
import {
  CAPS,
  MIN_DELIVERED,
  OVERLAP_COLLISION_HOURS,
  PAUSE_UNSUB,
  RECIPIENT_ZONES,
  SMS_WINDOW,
  SPIKE_FACTOR,
  WARM_STEPS,
  WARM_WAVE_GAP_HOURS,
} from './config';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Shared subscriber count between segment aId and segment bId.
 * shared(S, S) = size(S). Symmetric lookup in SegmentOverlap.
 */
export function sharedCountBetween(
  aId: string,
  bId: string,
  segments: readonly Segment[],
  overlaps: readonly SegmentOverlap[],
): number {
  if (aId === bId) {
    return segments.find((s) => s.id === aId)?.size ?? 0;
  }
  const found = overlaps.find(
    (o) => (o.segmentA === aId && o.segmentB === bId) || (o.segmentA === bId && o.segmentB === aId),
  );
  return found?.sharedCount ?? 0;
}

/* ------------------------------------------------------------------ Rule 1: Expected touches */

export interface ExpectedTouchesResult {
  segmentId: string;
  channel: Channel;
  touches: number;
  cap: number;
  overCap: boolean;
  contributingCampaignIds: string[];
}

/**
 * Rule 1 — Expected touches E(S, channel) on a given local day.
 * E(S) = Σ over active campaigns c of channel C on that day: shared(S, seg(c)) / size(S).
 * Counts scheduled, sending, and sent campaigns (excludes paused & draft unless passed in).
 */
export function expectedTouches(
  segment: Segment,
  channel: Channel,
  dayIso: string,
  campaigns: readonly Campaign[],
  segments: readonly Segment[],
  overlaps: readonly SegmentOverlap[],
  candidate?: Pick<Campaign, 'channel' | 'segmentId' | 'sendAt'>,
): ExpectedTouchesResult {
  const targetDay = dayKey(dayIso);
  const active = campaigns.filter(
    (c) =>
      c.channel === channel &&
      dayKey(c.sendAt) === targetDay &&
      c.status !== 'paused' &&
      c.status !== 'draft',
  );

  let total = 0;
  const contributingCampaignIds: string[] = [];

  for (const c of active) {
    const shared = sharedCountBetween(segment.id, c.segmentId, segments, overlaps);
    if (shared > 0 && segment.size > 0) {
      total += shared / segment.size;
      contributingCampaignIds.push(c.id);
    }
  }

  if (candidate && candidate.channel === channel && dayKey(candidate.sendAt) === targetDay) {
    const shared = sharedCountBetween(segment.id, candidate.segmentId, segments, overlaps);
    if (shared > 0 && segment.size > 0) {
      total += shared / segment.size;
    }
  }

  const touches = round2(total);
  const cap = CAPS[channel];
  return {
    segmentId: segment.id,
    channel,
    touches,
    cap,
    overCap: touches > cap,
    contributingCampaignIds,
  };
}

/**
 * Check all segments for cap breaches if a candidate campaign is scheduled.
 */
export function checkCapBreaches(
  candidate: Pick<Campaign, 'channel' | 'segmentId' | 'sendAt'>,
  campaigns: readonly Campaign[],
  segments: readonly Segment[],
  overlaps: readonly SegmentOverlap[],
): ExpectedTouchesResult[] {
  return segments
    .filter((seg) => sharedCountBetween(seg.id, candidate.segmentId, segments, overlaps) > 0)
    .map((seg) => expectedTouches(seg, candidate.channel, candidate.sendAt, campaigns, segments, overlaps, candidate))
    .filter((r) => r.overCap);
}

/* ------------------------------------------------------------------ Rule 2: Quiet hours */

export interface QuietHourWave {
  zoneId: string;
  zoneLabel: string;
  offsetHours: number;
  localTimeLabel: string; // e.g. "06:10"
  localHourDecimal: number;
  violates: boolean;
}

/**
 * Rule 2 — Quiet hours.
 * An SMS may only be sent between 08:00 and 21:00 recipient-local.
 * For a `localTime` send, the campaign is evaluated as one wave per recipient UTC offset.
 */
export function evaluateSmsWaves(sendAtIso: string, channel: Channel, localTime: boolean): QuietHourWave[] {
  if (channel !== 'sms') return [];
  const d = new Date(sendAtIso);
  const utcH = d.getUTCHours();
  const utcM = d.getUTCMinutes();

  const zones = localTime ? RECIPIENT_ZONES : [RECIPIENT_ZONES[1]]; // Chicago reference when not split
  return zones.map((z) => {
    const rawMin = ((utcH * 60 + utcM + z.offsetHours * 60) % 1440 + 1440) % 1440;
    const h = Math.floor(rawMin / 60);
    const m = rawMin % 60;
    const localHourDecimal = h + m / 60;
    const violates = localHourDecimal < SMS_WINDOW.startHour || localHourDecimal >= SMS_WINDOW.endHour;
    return {
      zoneId: z.id,
      zoneLabel: z.label,
      offsetHours: z.offsetHours,
      localTimeLabel: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      localHourDecimal,
      violates,
    };
  });
}

export function quietHourViolations(sendAtIso: string, channel: Channel, localTime: boolean): QuietHourWave[] {
  return evaluateSmsWaves(sendAtIso, channel, localTime).filter((w) => w.violates);
}

/* ------------------------------------------------------------------ Rule 3: Throughput */

export interface ThroughputOverlap {
  campaignA: Campaign;
  campaignB: Campaign;
  channel: Channel;
  overlapMinutes: number;
}

export function sendDurationHours(audience: number, throttlePerHour: number): number {
  if (audience <= 0) return 0;
  return Math.max(1, Math.ceil(audience / Math.max(1, throttlePerHour)));
}

export function throughputWarnings(campaigns: readonly Campaign[]): ThroughputOverlap[] {
  const active = campaigns.filter((c) => c.status !== 'paused' && c.status !== 'draft');
  const out: ThroughputOverlap[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.channel !== b.channel) continue;
      const aStart = new Date(a.sendAt).getTime();
      const aEnd = aStart + sendDurationHours(a.audience, a.throttlePerHour) * MS_PER_HOUR;
      const bStart = new Date(b.sendAt).getTime();
      const bEnd = bStart + sendDurationHours(b.audience, b.throttlePerHour) * MS_PER_HOUR;
      const overlapMs = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
      if (overlapMs > 0) {
        out.push({
          campaignA: a,
          campaignB: b,
          channel: a.channel,
          overlapMinutes: Math.round(overlapMs / 60_000),
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ Rule 4: Warm-up waves */

export interface WarmUpWavePlan {
  waveIndex: number;
  sendAt: string;
  audience: number;
  weight: number;
}

export interface WarmUpEvaluation {
  recentMaxDayVolume: number;
  spikeThreshold: number;
  needsWarmUp: boolean;
  waves: WarmUpWavePlan[];
}

/**
 * Rule 4 — Warm-up.
 * If audience > SPIKE_FACTOR (2) * largest day volume of the last 7 days on that channel,
 * split into WARM_STEPS ([0.25, 0.5, 1]) proportional waves two hours apart.
 */
export function evaluateWarmUp(
  audience: number,
  channel: Channel,
  sendAtIso: string,
  campaigns: readonly Campaign[],
  now: Date,
): WarmUpEvaluation {
  const cutoffMs = now.getTime() - 7 * MS_PER_DAY;
  const nowMs = now.getTime();
  const byDay = new Map<string, number>();

  const todayKey = dayKey(now.toISOString());
  for (const c of campaigns) {
    if (c.channel !== channel) continue;
    if (c.status === 'draft') continue;
    const t = new Date(c.sendAt).getTime();
    const dk = dayKey(c.sendAt);
    if (t >= cutoffMs && t <= nowMs && (c.status === 'sent' || dk < todayKey)) {
      byDay.set(dk, (byDay.get(dk) ?? 0) + c.audience);
    }
  }

  const recentMaxDayVolume = Math.max(0, ...byDay.values());
  const spikeThreshold = recentMaxDayVolume * SPIKE_FACTOR;
  const needsWarmUp = recentMaxDayVolume > 0 && audience > spikeThreshold;

  if (!needsWarmUp) {
    return {
      recentMaxDayVolume,
      spikeThreshold,
      needsWarmUp: false,
      waves: [{ waveIndex: 1, sendAt: sendAtIso, audience, weight: 1 }],
    };
  }

  const sumWeights = WARM_STEPS.reduce((a, b) => a + b, 0); // 1.75
  const baseMs = new Date(sendAtIso).getTime();
  let remaining = audience;

  const waves: WarmUpWavePlan[] = WARM_STEPS.map((w, idx) => {
    const isLast = idx === WARM_STEPS.length - 1;
    const waveAud = isLast ? remaining : Math.round((audience * w) / sumWeights);
    remaining -= waveAud;
    return {
      waveIndex: idx + 1,
      sendAt: new Date(baseMs + idx * WARM_WAVE_GAP_HOURS * MS_PER_HOUR).toISOString(),
      audience: waveAud,
      weight: w,
    };
  });

  return { recentMaxDayVolume, spikeThreshold, needsWarmUp: true, waves };
}

/* ------------------------------------------------------------------ Rule 5: Auto-pause */

export interface AutoPauseCheck {
  unsubRate: number;
  unsubRatePct: number;
  threshold: number;
  shouldPause: boolean;
}

/**
 * Rule 5 — Auto-pause.
 * After MIN_DELIVERED (2000) delivered, unsubs / delivered >= PAUSE_UNSUB[channel] pauses the campaign.
 */
export function evaluateAutoPause(
  delivered: number,
  unsubs: number,
  channel: Channel,
): AutoPauseCheck {
  const unsubRate = delivered > 0 ? unsubs / delivered : 0;
  const unsubRatePct = Math.round(unsubRate * 10000) / 100; // e.g. 0.70%
  const threshold = PAUSE_UNSUB[channel];
  const shouldPause = delivered >= MIN_DELIVERED && unsubRate >= threshold;
  return { unsubRate, unsubRatePct, threshold, shouldPause };
}

/* ------------------------------------------------------------------ Collision ties (centrepiece + list) */

export interface CollisionPair {
  aId: string;
  bId: string;
  sharedSubscribers: number;
  gapMinutes: number;
}

/**
 * Finds every pair of active campaigns within 2 hours of each other whose segments share subscribers.
 * Used to glow pins amber & draw tie arcs on the cylinder AND mark the same pairs in List view (AC5).
 */
export function findCollisionPairs(
  campaigns: readonly Campaign[],
  segments: readonly Segment[],
  overlaps: readonly SegmentOverlap[],
): CollisionPair[] {
  const active = campaigns.filter((c) => c.status !== 'draft' && c.status !== 'paused');
  const pairs: CollisionPair[] = [];
  const maxGapMs = OVERLAP_COLLISION_HOURS * MS_PER_HOUR;

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const gapMs = Math.abs(new Date(a.sendAt).getTime() - new Date(b.sendAt).getTime());
      if (gapMs > maxGapMs) continue;
      const shared = sharedCountBetween(a.segmentId, b.segmentId, segments, overlaps);
      if (shared <= 0) continue;
      pairs.push({
        aId: a.id,
        bId: b.id,
        sharedSubscribers: shared,
        gapMinutes: Math.round(gapMs / 60_000),
      });
    }
  }
  return pairs;
}
