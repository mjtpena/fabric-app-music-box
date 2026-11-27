import type { DataStore } from '@x10/shared/data';
import type { SeedContext } from '@x10/shared/runtime';

import type { Schema } from './model';

function atUtc(base: Date, dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + dayOffset, hour, minute, 0, 0),
  );
  return d.toISOString();
}

/**
 * Deterministic seed for Music Box:
 * - 8 segments with realistic overlaps
 * - 14 campaigns:
 *   - VIP Winter Buyers at 4.2 expected email touches (over cap of 3!)
 *   - Holiday Gifters at exactly 3.0 expected email touches (AC1 ready!)
 *   - An SMS local-time campaign at 12:10 UTC -> 06:10 in Chicago (AC2)
 *   - A draft campaign at 3x recent max volume needing warm-up split (AC3)
 *   - A paused campaign at 0.72% unsubscribes after 2,500 delivered (AC4)
 *   - Overlapping pairs within 2 hours (AC5 amber glow + tie)
 *   - 2 sent & clean campaigns establishing the 7-day baseline volume (20,000)
 *   - 1 override awaiting Messaging lead approval
 */
export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const [lead, owner] = ctx.people;
  const now = ctx.now;

  const segRepo = store.repo('Segment');
  const vip = await segRepo.create({ name: 'VIP Winter Buyers', size: 10000, ownerSub: lead.sub });
  const gifters = await segRepo.create({ name: 'Holiday Gifters', size: 20000, ownerSub: lead.sub });
  const loyalty = await segRepo.create({ name: 'Loyalty Members', size: 25000, ownerSub: lead.sub });
  const cart = await segRepo.create({ name: 'Cart Abandoners', size: 8000, ownerSub: lead.sub });
  const appUsers = await segRepo.create({ name: 'Mobile App Active', size: 18000, ownerSub: lead.sub });
  const smsOpt = await segRepo.create({ name: 'SMS Early Access', size: 12000, ownerSub: lead.sub });
  const homeDec = await segRepo.create({ name: 'Home & Decor', size: 15000, ownerSub: lead.sub });
  const lapsed = await segRepo.create({ name: 'Lapsed 90-Day', size: 30000, ownerSub: lead.sub });

  // Overlaps (carefully tuned so VIP Winter Buyers reaches 4.2 expected email touches today!)
  const ovRepo = store.repo('SegmentOverlap');
  const overlaps: Array<[string, string, number]> = [
    [vip.id, loyalty.id, 7000], // +0.7 on VIP per Loyalty email
    [vip.id, gifters.id, 5000], // +0.5 on VIP per Gifters email
    [vip.id, appUsers.id, 4500],
    [vip.id, smsOpt.id, 4000],
    [vip.id, cart.id, 2500],
    [gifters.id, homeDec.id, 6000],
    [gifters.id, appUsers.id, 5000],
    [loyalty.id, appUsers.id, 8000],
    [loyalty.id, smsOpt.id, 5500],
    [cart.id, appUsers.id, 3200],
    [homeDec.id, lapsed.id, 4000],
  ];
  for (const [a, b, shared] of overlaps) {
    await ovRepo.create({ segmentA: a, segmentB: b, sharedCount: shared, ownerSub: lead.sub });
  }

  const campRepo = store.repo('Campaign');

  // 1-2. Two sent & clean campaigns over the last 7 days (sets 7-day max day email volume = 20,000)
  await campRepo.create({
    name: 'Advent Kickoff Digest',
    channel: 'email',
    segmentId: homeDec.id,
    sendAt: atUtc(now, -3, 15, 0),
    audience: 15000,
    throttlePerHour: 15000,
    localTime: false,
    status: 'sent',
    delivered: 14820,
    unsubs: 31, // 0.21% clean
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });
  await campRepo.create({
    name: 'Weekend Gift Guide',
    channel: 'email',
    segmentId: gifters.id,
    sendAt: atUtc(now, -2, 16, 0),
    audience: 20000,
    throttlePerHour: 20000,
    localTime: false,
    status: 'sent',
    delivered: 19740,
    unsubs: 44, // 0.22% clean
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });

  // 3-4. Two direct VIP emails today (+2.0 on VIP)
  await campRepo.create({
    name: 'VIP Brassware Preview',
    channel: 'email',
    segmentId: vip.id,
    sendAt: atUtc(now, 0, 14, 0),
    audience: 10000,
    throttlePerHour: 10000,
    localTime: false,
    status: 'scheduled',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });
  await campRepo.create({
    name: 'VIP Private Vault',
    channel: 'email',
    segmentId: vip.id,
    sendAt: atUtc(now, 0, 18, 0),
    audience: 10000,
    throttlePerHour: 10000,
    localTime: false,
    status: 'scheduled',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: lead.sub,
    ownerName: lead.displayName,
  });

  // 5-6. Two Loyalty emails today (+1.4 on VIP via 7,000/10,000 each -> VIP now 3.4)
  await campRepo.create({
    name: 'Loyalty Double Points',
    channel: 'email',
    segmentId: loyalty.id,
    sendAt: atUtc(now, 0, 15, 0), // within 1h of VIP Brassware -> AMBER COLLISION TIE (AC5)!
    audience: 25000,
    throttlePerHour: 12500,
    localTime: false,
    status: 'scheduled',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });
  await campRepo.create({
    name: 'Loyalty Tier Reminder',
    channel: 'push',
    segmentId: loyalty.id,
    sendAt: atUtc(now, 0, 20, 0),
    audience: 25000,
    throttlePerHour: 15000,
    localTime: false,
    status: 'scheduled',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });

  // 7-9. Three Holiday Gifters emails? Wait: if Gifters has 2 direct emails (+1.0 on VIP via 5000/10000 each -> VIP = 4.4? Wait: let's make VIP EXACTLY 4.2!)
  // VIP currently has: 1.0 + 1.0 + 0.7 + 0.7 = 3.4.
  // Adding 1 Gifters email (+0.5 -> 3.9) + 1 Cart email (+0.25 -> 4.15 -> wait, let's adjust overlap or campaigns):
  // Let's give Gifters 3 emails for AC1 ("segment already at 3 expected touches"):
  // Wait: if Gifters has 3 direct emails today, Gifters E(email) = 3.0 (exact AC1!), and if VIP overlaps Gifters by 2,667? Even cleaner:
  // VIP overlaps: Loyalty 7000 (1 Loyalty email = +0.7), Gifters 5000 (3 Gifters emails = +1.5), + 2 VIP emails = 2.0 -> 2.0 + 0.7 + 1.5 = 4.20 EXACT!
  // Let's make Loyalty's second campaign a PUSH instead of email so VIP email = 2.0 + 0.7 + 1.5 = 4.20 AND Gifters email = 3.00!
  // Wait: let's update campaign #6 above right now before writing? We are writing the file right now! Let's make #6 a Push campaign!
  await campRepo.create({
    name: 'Gift Guide Morning',
    channel: 'email',
    segmentId: gifters.id,
    sendAt: atUtc(now, 0, 10, 0),
    audience: 20000,
    throttlePerHour: 20000,
    localTime: false,
    status: 'scheduled',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });
  await campRepo.create({
    name: 'Gift Wrap Cutoff',
    channel: 'email',
    segmentId: gifters.id,
    sendAt: atUtc(now, 0, 16, 0),
    audience: 20000,
    throttlePerHour: 20000,
    localTime: false,
    status: 'scheduled',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });
  await campRepo.create({
    name: 'Express Shipping Reminder',
    channel: 'email',
    segmentId: gifters.id,
    sendAt: atUtc(now, 0, 21, 0),
    audience: 20000,
    throttlePerHour: 20000,
    localTime: false,
    status: 'scheduled',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: lead.sub,
    ownerName: lead.displayName,
  });

  // 10. SMS local-time wave at 12:10 UTC -> 06:10 in Chicago (AC2 quiet-hour violation)
  await campRepo.create({
    name: 'Early Bird SMS Flash',
    channel: 'sms',
    segmentId: smsOpt.id,
    sendAt: atUtc(now, 0, 12, 10),
    audience: 12000,
    throttlePerHour: 12000,
    localTime: true,
    status: 'draft',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });

  // 11. Paused campaign at 0.72% unsubscribes after 2,500 delivered (AC4)
  await campRepo.create({
    name: 'Lapsed Win-Back Blast',
    channel: 'email',
    segmentId: lapsed.id,
    sendAt: atUtc(now, 0, 11, 0),
    audience: 30000,
    throttlePerHour: 10000,
    localTime: false,
    status: 'paused',
    delivered: 2500,
    unsubs: 18, // 0.72% (>= 0.5% email threshold)
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });

  // 12. 3x volume spike draft needing warm-up split (60,000 vs 20,000 recent max -> AC3)
  await campRepo.create({
    name: 'Winter Clearance Mega Send',
    channel: 'email',
    segmentId: lapsed.id,
    sendAt: atUtc(now, 1, 14, 0),
    audience: 60000,
    throttlePerHour: 20000,
    localTime: false,
    status: 'draft',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });

  // 13. Override awaiting Messaging lead approval
  await campRepo.create({
    name: 'VIP Same-Day Courier Alert',
    channel: 'email',
    segmentId: vip.id,
    sendAt: atUtc(now, 0, 19, 30),
    audience: 10000,
    throttlePerHour: 10000,
    localTime: false,
    status: 'draft',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: 'Weather delay courier cutoff requires urgent same-day notice to VIP buyers.',
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });

  // 14. Mobile App Push within 1.5h of VIP Brassware (overlapping subscribers -> AC5 amber glow!)
  await campRepo.create({
    name: 'App Stock Drop Push',
    channel: 'push',
    segmentId: appUsers.id,
    sendAt: atUtc(now, 0, 15, 30),
    audience: 18000,
    throttlePerHour: 18000,
    localTime: false,
    status: 'scheduled',
    delivered: 0,
    unsubs: 0,
    capOverrideReason: null,
    approvedBySub: null,
    approvedByName: null,
    waveGroup: null,
    waveIndex: null,
    ownerSub: owner.sub,
    ownerName: owner.displayName,
  });
}
