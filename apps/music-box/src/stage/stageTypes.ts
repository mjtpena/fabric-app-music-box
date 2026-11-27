export type CylinderLens = 'touches' | 'channel' | 'status' | 'unsub' | 'owner';
export type MusicRole = 'owner' | 'lead';
export type CylinderFocus =
  | { kind: 'all' }
  | { kind: 'overcap' }
  | { kind: 'quiet' }
  | { kind: 'paused' }
  | { kind: 'warmup' }
  | { kind: 'override' }
  | { kind: 'collision' };
