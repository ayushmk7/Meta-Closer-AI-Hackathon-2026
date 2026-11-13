// Share links (CONTRACTS Decisions, batch 5): built on the client, never minted by the server.
// A link holds a plan or share id only, never a user id (C3/C4); the OS share sheet opens on a tap.
import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { when } from './time';

export const planLink = (planId: string): string =>
  Linking.createURL(`/common-ground/shared/${encodeURIComponent(planId)}`);
export const welcomeLink = (shareId?: string): string =>
  Linking.createURL('/common-ground/welcome', shareId ? { queryParams: { share: shareId } } : {});

// "<title>\n<Sun, Nov 15 · 7 PM> · <neighborhood>\n<link>". Never who is in it (C5).
export const planMessage = (p: {
  planId: string;
  title: string;
  startsAt: string;
  venue: { neighborhood?: string | null };
}): string =>
  [
    p.title,
    [when(p.startsAt), p.venue.neighborhood].filter(Boolean).join(' · '),
    planLink(p.planId),
  ].join('\n');

// A dismissed or failed sheet is not an error worth showing.
export async function shareOut(message: string): Promise<void> {
  try {
    await Share.share({ message });
  } catch {
    // swallowed: the user closed the sheet or the OS refused
  }
}
