import { describe, expect, it } from 'vitest';

import { createMemoryStore, PermissionError, RuleError } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';

import { defs, type Campaign, type Schema, type Segment, type SegmentOverlap } from '../model';
import {
  recordDeliveryMetrics,
  resumeCampaign,
  scheduleCampaign,
} from './campaigns';
import {
  evaluateAutoPause,
  evaluateWarmUp,
  expectedTouches,
  findCollisionPairs,
  quietHourViolations,
  throughputWarnings,
} from './rules';

const LEAD: Person = {
  id: 'p-lead',
  sub: 'demo-lead-morgan',
  displayName: 'Morgan Chen',
  email: 'morgan@example.com',
  isAdmin: true,
  createdAt: '2026-11-01T00:00:00Z',
};

const OWNER: Person = {
  id: 'p-owner',
  sub: 'demo-owner-dana',
  displayName: 'Dana Patel',
  email: 'dana@example.com',
  isAdmin: false,
  createdAt: '2026-11-01T00:00:00Z',
};

const DAY = '2026-12-07';

describe('Rule 1 — Expected touches & fatigue caps', () => {
  const segA: Segment = { id: 'seg-a', name: 'VIP', size: 10000, ownerSub: LEAD.sub };
  const segB: Segment = { id: 'seg-b', name: 'All Buyers', size: 40000, ownerSub: LEAD.sub };
  const overlaps: SegmentOverlap[] = [{ id: 'ov-1', segmentA: 'seg-a', segmentB: 'seg-b', sharedCount: 6000, ownerSub: LEAD.sub }];

  it('computes E(S) using shared(S, seg(c)) / size(S)', () => {
    const camps: Campaign[] = [
      {
        id: 'c1', name: 'Morning', channel: 'email', segmentId: 'seg-a', sendAt: `${DAY}T14:00:00Z`,
        audience: 10000, throttlePerHour: 10000, localTime: false, status: 'scheduled',
        delivered: 0, unsubs: 0, capOverrideReason: null, approvedBySub: null, approvedByName: null,
        waveGroup: null, waveIndex: null, ownerSub: OWNER.sub, ownerName: OWNER.displayName,
      },
      {
        id: 'c2', name: 'Noon', channel: 'email', segmentId: 'seg-b', sendAt: `${DAY}T17:00:00Z`,
        audience: 40000, throttlePerHour: 20000, localTime: false, status: 'scheduled',
        delivered: 0, unsubs: 0, capOverrideReason: null, approvedBySub: null, approvedByName: null,
        waveGroup: null, waveIndex: null, ownerSub: OWNER.sub, ownerName: OWNER.displayName,
      },
    ];
    const res = expectedTouches(segA, 'email', `${DAY}T12:00:00Z`, camps, [segA, segB], overlaps);
    expect(res.touches).toBe(1.6); // 1.0 + 6000/10000
    expect(res.overCap).toBe(false);
  });

  it('AC1: scheduling a 4th email to a segment already at 3 touches is blocked; lead can override with 20+ char reason', async () => {
    const store = createMemoryStore<Schema>(defs);
    const seg = await store.repo('Segment').create({ name: 'Holiday Gifters', size: 20000, ownerSub: LEAD.sub });
    for (let i = 1; i <= 3; i++) {
      await store.repo('Campaign').create({
        name: `Email ${i}`, channel: 'email', segmentId: seg.id, sendAt: `${DAY}T${12 + i * 2}:00:00Z`,
        audience: 10000, throttlePerHour: 10000, localTime: false, status: 'scheduled',
        delivered: 0, unsubs: 0, capOverrideReason: null, approvedBySub: null, approvedByName: null,
        waveGroup: null, waveIndex: null, ownerSub: OWNER.sub, ownerName: OWNER.displayName,
      });
    }

    // Blocked without override
    await expect(
      scheduleCampaign(store, OWNER, {
        name: 'Fourth Email', channel: 'email', segmentId: seg.id, sendAt: `${DAY}T20:00:00Z`,
        audience: 10000, throttlePerHour: 10000, localTime: false,
      }),
    ).rejects.toThrow(RuleError);

    // Blocked with too-short reason
    await expect(
      scheduleCampaign(store, LEAD, {
        name: 'Fourth Email', channel: 'email', segmentId: seg.id, sendAt: `${DAY}T20:00:00Z`,
        audience: 10000, throttlePerHour: 10000, localTime: false, capOverrideReason: 'Too short',
      }),
    ).rejects.toThrow(RuleError);

    // Lead overrides with 20+ char reason
    const res = await scheduleCampaign(store, LEAD, {
      name: 'Fourth Email', channel: 'email', segmentId: seg.id, sendAt: `${DAY}T20:00:00Z`,
      audience: 10000, throttlePerHour: 10000, localTime: false,
      capOverrideReason: 'Executive shipping cutoff notice approved for VIP cohort.',
    });
    expect(res.created).toHaveLength(1);
    expect(res.created[0].approvedBySub).toBe(LEAD.sub);
    expect(res.created[0].status).toBe('scheduled');
  });
});

describe('Rule 2 — SMS quiet hours (08:00-21:00 local)', () => {
  it('AC2: SMS local-time at 12:10 UTC flags 06:10 Chicago wave and blocks scheduling until shifted', async () => {
    const violations = quietHourViolations(`${DAY}T12:10:00Z`, 'sms', true);
    expect(violations.some((v) => v.zoneId === 'CT' && v.localTimeLabel === '06:10')).toBe(true);

    const store = createMemoryStore<Schema>(defs);
    const seg = await store.repo('Segment').create({ name: 'SMS Subscribers', size: 15000, ownerSub: LEAD.sub });
    await expect(
      scheduleCampaign(store, OWNER, {
        name: 'Early SMS Alert', channel: 'sms', segmentId: seg.id, sendAt: `${DAY}T12:10:00Z`,
        audience: 5000, throttlePerHour: 5000, localTime: true,
      }),
    ).rejects.toThrow(/06:10|07:10/);

    // Shifting to 16:10 UTC (11:10 ET, 10:10 CT, 09:10 MT, 08:10 PT) clears all waves
    expect(quietHourViolations(`${DAY}T16:10:00Z`, 'sms', true)).toHaveLength(0);
    const ok = await scheduleCampaign(store, OWNER, {
      name: 'Midday SMS Alert', channel: 'sms', segmentId: seg.id, sendAt: `${DAY}T16:10:00Z`,
      audience: 5000, throttlePerHour: 5000, localTime: true,
    });
    expect(ok.created[0].status).toBe('scheduled');
  });
});

describe('Rule 3 — Throughput overlap warnings', () => {
  it('warns when two same-channel sending windows overlap', () => {
    const camps: Campaign[] = [
      {
        id: 'a', name: 'A', channel: 'email', segmentId: 's1', sendAt: `${DAY}T14:00:00Z`,
        audience: 30000, throttlePerHour: 15000, localTime: false, status: 'scheduled',
        delivered: 0, unsubs: 0, capOverrideReason: null, approvedBySub: null, approvedByName: null,
        waveGroup: null, waveIndex: null, ownerSub: OWNER.sub, ownerName: OWNER.displayName,
      },
      {
        id: 'b', name: 'B', channel: 'email', segmentId: 's2', sendAt: `${DAY}T15:00:00Z`,
        audience: 15000, throttlePerHour: 15000, localTime: false, status: 'scheduled',
        delivered: 0, unsubs: 0, capOverrideReason: null, approvedBySub: null, approvedByName: null,
        waveGroup: null, waveIndex: null, ownerSub: OWNER.sub, ownerName: OWNER.displayName,
      },
    ];
    const warns = throughputWarnings(camps);
    expect(warns).toHaveLength(1);
    expect(warns[0].overlapMinutes).toBe(60);
  });
});

describe('Rule 4 — Warm-up spike splitting', () => {
  it('AC3: campaign at 3x recent max volume is split into 3 waves 2 hours apart', async () => {
    const now = new Date(`${DAY}T12:00:00Z`);
    const store = createMemoryStore<Schema>(defs);
    const seg = await store.repo('Segment').create({ name: 'Full List', size: 120000, ownerSub: LEAD.sub });
    // Recent max day volume = 20,000
    await store.repo('Campaign').create({
      name: 'Last Week Baseline', channel: 'email', segmentId: seg.id, sendAt: '2026-12-04T15:00:00Z',
      audience: 20000, throttlePerHour: 20000, localTime: false, status: 'sent',
      delivered: 20000, unsubs: 40, capOverrideReason: null, approvedBySub: null, approvedByName: null,
      waveGroup: null, waveIndex: null, ownerSub: OWNER.sub, ownerName: OWNER.displayName,
    });

    const evalRes = evaluateWarmUp(60000, 'email', `${DAY}T14:00:00Z`, await store.repo('Campaign').list(), now);
    expect(evalRes.needsWarmUp).toBe(true);
    expect(evalRes.waves).toHaveLength(3);

    const res = await scheduleCampaign(
      store,
      OWNER,
      {
        name: 'Cyber Finale Blast', channel: 'email', segmentId: seg.id, sendAt: `${DAY}T14:00:00Z`,
        audience: 60000, throttlePerHour: 25000, localTime: false,
      },
      now,
    );
    expect(res.created).toHaveLength(3);
    expect(res.created[0].waveIndex).toBe(1);
    expect(res.created[1].waveIndex).toBe(2);
    expect(res.created[2].waveIndex).toBe(3);
    const gapMs = new Date(res.created[1].sendAt).getTime() - new Date(res.created[0].sendAt).getTime();
    expect(gapMs).toBe(2 * 3_600_000);
  });
});

describe('Rule 5 — Auto-pause on unsubscribe spike', () => {
  it('AC4: 0.7% unsubscribes after 2,500 delivered pauses automatically and owner cannot resume', async () => {
    const check = evaluateAutoPause(2500, 18, 'email'); // 0.72% >= 0.5%
    expect(check.shouldPause).toBe(true);
    // Below MIN_DELIVERED (2000) does not auto-pause
    expect(evaluateAutoPause(1500, 15, 'email').shouldPause).toBe(false);

    const store = createMemoryStore<Schema>(defs);
    const seg = await store.repo('Segment').create({ name: 'Promo', size: 10000, ownerSub: LEAD.sub });
    const camp = await store.repo('Campaign').create({
      name: 'Flash Promo', channel: 'email', segmentId: seg.id, sendAt: `${DAY}T14:00:00Z`,
      audience: 10000, throttlePerHour: 10000, localTime: false, status: 'sending',
      delivered: 1000, unsubs: 2, capOverrideReason: null, approvedBySub: null, approvedByName: null,
      waveGroup: null, waveIndex: null, ownerSub: OWNER.sub, ownerName: OWNER.displayName,
    });

    const { record, autoPaused } = await recordDeliveryMetrics(store, OWNER, camp.id, 2500, 18);
    expect(autoPaused).toBe(true);
    expect(record.status).toBe('paused');

    // Owner cannot resume; Messaging lead can
    await expect(resumeCampaign(store, OWNER, camp.id)).rejects.toThrow(PermissionError);
    const resumed = await resumeCampaign(store, LEAD, camp.id);
    expect(resumed.status).toBe('sending');
  });
});

describe('Collision ties (AC5)', () => {
  it('AC5: two pins within 2 hours in overlapping rows are paired', () => {
    const s1: Segment = { id: 's1', name: 'VIP', size: 10000, ownerSub: LEAD.sub };
    const s2: Segment = { id: 's2', name: 'App Users', size: 15000, ownerSub: LEAD.sub };
    const ov: SegmentOverlap[] = [{ id: 'o1', segmentA: 's1', segmentB: 's2', sharedCount: 4500, ownerSub: LEAD.sub }];
    const camps: Campaign[] = [
      {
        id: 'c1', name: 'VIP Drop', channel: 'email', segmentId: 's1', sendAt: `${DAY}T14:00:00Z`,
        audience: 10000, throttlePerHour: 10000, localTime: false, status: 'scheduled',
        delivered: 0, unsubs: 0, capOverrideReason: null, approvedBySub: null, approvedByName: null,
        waveGroup: null, waveIndex: null, ownerSub: OWNER.sub, ownerName: OWNER.displayName,
      },
      {
        id: 'c2', name: 'App Push', channel: 'push', segmentId: 's2', sendAt: `${DAY}T15:15:00Z`,
        audience: 15000, throttlePerHour: 15000, localTime: false, status: 'scheduled',
        delivered: 0, unsubs: 0, capOverrideReason: null, approvedBySub: null, approvedByName: null,
        waveGroup: null, waveIndex: null, ownerSub: OWNER.sub, ownerName: OWNER.displayName,
      },
    ];
    const pairs = findCollisionPairs(camps, [s1, s2], ov);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].sharedSubscribers).toBe(4500);
    expect(pairs[0].gapMinutes).toBe(75);
  });
});
