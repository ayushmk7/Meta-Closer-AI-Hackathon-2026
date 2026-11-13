// Passport stamps (client-only, CONTRACTS Decisions). Pure.
import { TZ, type Meetup, type Venue } from './types';

export type StampKind = 'activity' | 'neighborhood' | 'venue';
export interface Stamp {
  kind: StampKind;
  key: string;
  label: string;
  earned: boolean;
  earnedOn?: string; // "Nov 14": the earning meetup's day
  venueKind?: string;
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
const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });

// Earned the moment I'm verified in person or checked in at a meetup (no wait for completion). Locked: anything else I've seen
// (feed, plans, other meetups), so the grid shows what's left to collect. Earned first.
export function stamps(meetups: Meetup[], seen: { activityType: string; venue: Venue }[]): Stamp[] {
  const out = new Map<string, Stamp>();
  const add = (x: { activityType: string; venue: Venue }, earned: boolean, startsAt?: string) => {
    for (const [kind, key, label] of keysOf(x)) {
      const id = `${kind}:${key}`;
      if (out.get(id)?.earned) continue;
      out.set(id, {
        kind,
        key,
        label,
        earned,
        ...(earned && startsAt ? { earnedOn: shortDay(startsAt) } : {}),
        ...(kind === 'venue' ? { venueKind: x.venue.kind } : {}),
      });
    }
  };
  for (const m of meetups) {
    const me = m.attendees.find((a) => a.isMe);
    add(m, !!(me?.verified || me?.checkedIn), m.startsAt);
  }
  seen.forEach((x) => add(x, false));
  return [...out.values()].sort((a, b) => Number(b.earned) - Number(a.earned));
}

// Share text (spec §4): earned count, up to 3 earned activities and neighborhoods, a link. Never venue
// names, dates, people or locked stamps.
export function shareText(all: Stamp[], link: string): string {
  const got = all.filter((x) => x.earned);
  const list = (kind: StampKind) => {
    const xs = got.filter((x) => x.kind === kind).map((x) => x.label);
    return xs.length > 3 ? `${xs.slice(0, 3).join(', ')} and ${xs.length - 3} more` : xs.join(', ');
  };
  return [
    `My Plans passport: ${got.length} ${got.length === 1 ? 'stamp' : 'stamps'}.`,
    list('activity'),
    list('neighborhood'),
    `See what people are doing on Facebook Plans: ${link}`,
  ]
    .filter(Boolean)
    .join('\n');
}
