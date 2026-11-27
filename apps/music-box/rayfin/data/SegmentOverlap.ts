import { entity, int, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * Shared subscriber count between two audience segments.
 * Read by all authenticated users; writes by creator (enforced in domain).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', ['create', 'update', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.ownerSub),
})
export class SegmentOverlap {
  @uuid() id!: string;
  @uuid() segmentA!: string;
  @uuid() segmentB!: string;
  @int() sharedCount!: number;
  @text({ min: 1, max: 100 }) ownerSub!: string;
}
