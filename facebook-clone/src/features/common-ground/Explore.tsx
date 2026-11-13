// Explore: the anonymous gallery of plans people went to, as a Facebook-style feed.
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Card, Chips, Empty, Muted, Page, Title } from '../../ui/native';
import ShareCard, { activityLabel } from './ShareCard';
import { load, useCg } from './store';
import type { Share } from './types';
import { Banners } from './ui';

const ALL = 'All';
const EVERYWHERE = 'Everywhere';
const distinct = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();

// ponytail: filters run on the loaded list (galleryMax is 30); listShares' query filters
// are there if the gallery outgrows one page.
export const filterShares = (shares: Share[], activity: string, place: string): Share[] =>
  shares.filter(
    (s) =>
      (activity === ALL || activityLabel(s.activityType) === activity) &&
      (place === EVERYWHERE || s.venue.neighborhood === place),
  );

export default function ExploreScreen() {
  const shares = useCg((s) => s.shares);
  const [activity, setActivity] = useState(ALL);
  const [place, setPlace] = useState(EVERYWHERE);
  useEffect(() => void load.shares(), []);
  const shown = filterShares(shares, activity, place);
  return (
    <Page>
      <Banners />
      {/* Web: the Shell's back row already shows the screen title. */}
      {Platform.OS !== 'web' && <Title>Explore</Title>}
      <Muted style={{ paddingHorizontal: 16, marginTop: Platform.OS === 'web' ? 8 : -16 }}>
        Plans people nearby went to. No names or faces.
      </Muted>
      <Card style={{ paddingTop: 12 }}>
        <Chips
          items={[ALL, ...distinct(shares.map((s) => activityLabel(s.activityType)))]}
          value={activity}
          onChange={setActivity}
        />
        <Chips
          items={[EVERYWHERE, ...distinct(shares.map((s) => s.venue.neighborhood))]}
          value={place}
          onChange={setPlace}
        />
      </Card>
      {shown.map((s) => (
        <ShareCard key={s.shareId} share={s} />
      ))}
      {shares.length > 0 && shown.length === 0 && (
        <Card>
          <Empty title="Nothing here yet" message="Try another activity or neighborhood." />
        </Card>
      )}
      <View style={{ height: 8 }} />
    </Page>
  );
}
