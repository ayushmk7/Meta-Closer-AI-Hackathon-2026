// Passport stamps (client-only, CONTRACTS Decisions). Pure.
import type { Meetup, Venue } from './types';

export type StampKind = 'activity' | 'neighborhood' | 'venue';
export interface Stamp {
  kind: StampKind;
  key: string;
  label: string;
  earned: boolean;
}

// "board_game_night" -> "Board game night"
export const human = (id: string) => {
  const s = id.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const keysOf = (x: { activityType: string; venue: Venue }): [StampKind, string, string][] => [
  ['activity', x.activityType, human(x.activityType)],
  ...(x.venue.neighborhood
    ? [['neighborhood', x.venue.neighborhood, x.venue.neighborhood] as [StampKind, string, string]]
    : []),
  ['venue', x.venue.venueId, x.venue.name],
];

// Earned: verified in person at a meetup (the moment it happens), or a completed meetup I checked in to. Locked: anything else I've seen
// (feed, plans, other meetups), so the grid shows what's left to collect. Earned first.
export function stamps(meetups: Meetup[], seen: { activityType: string; venue: Venue }[]): Stamp[] {
  const out = new Map<string, Stamp>();
  const add = (x: { activityType: string; venue: Venue }, earned: boolean) => {
    for (const [kind, key, label] of keysOf(x)) {
      const id = `${kind}:${key}`;
      if (!out.get(id)?.earned) out.set(id, { kind, key, label, earned });
    }
  };
  for (const m of meetups) {
    const me = m.attendees.find((a) => a.isMe);
    add(m, !!me?.verified || (m.status === 'completed' && !!me?.checkedIn));
  }
  seen.forEach((x) => add(x, false));
  return [...out.values()].sort((a, b) => Number(b.earned) - Number(a.earned));
}
