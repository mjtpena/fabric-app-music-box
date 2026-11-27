import { AppMarker } from './AppMarker.js';
import { Campaign } from './Campaign.js';
import { Person } from './Person.js';
import { Segment } from './Segment.js';
import { SegmentOverlap } from './SegmentOverlap.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  Segment: Segment;
  SegmentOverlap: SegmentOverlap;
  Campaign: Campaign;
};

export const schema = [Person, AppMarker, Segment, SegmentOverlap, Campaign];
