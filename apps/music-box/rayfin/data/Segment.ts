import { entity, int, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * Audience segment along the length of the music-box cylinder.
 * Read by all authenticated users; writes by creator (enforced in domain).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', ['create', 'update', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.ownerSub),
})
export class Segment {
  @uuid() id!: string;
  @text({ min: 3, max: 60 }) name!: string;
  @int() size!: number;
  @text({ min: 1, max: 100 }) ownerSub!: string;
}
