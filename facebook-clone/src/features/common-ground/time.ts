// Display times (guide 1.1): always America/Los_Angeles. Pure, so Node tests import it.
import { TZ } from './types';

// "10 AM", "9:30 AM" in LA time: no ":00", a plain space before AM/PM (ICU may emit U+202F).
export const clock = (iso: string): string =>
  new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
    .replace(':00', '')
    .replace(/\s/g, ' ');
// "Sat, Nov 14 · 10 AM"
export const when = (iso: string): string =>
  `${new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })} · ${clock(iso)}`;
