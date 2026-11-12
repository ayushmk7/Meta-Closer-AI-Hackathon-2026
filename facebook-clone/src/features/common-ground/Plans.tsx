// STUB (A1). Owned by slice B: replace freely, keep the default export.
// Renders the mock feed so the tab works end to end on M0.
import { ScrollView, View } from 'react-native';
import { Button, Card, Label, Muted, Page, Title, go } from '../../ui/native';
import MuseBar from './MuseBar';
import PlanCard from './PlanCard';
import { useCg } from './store';
import { Banners } from './ui';

export default function PlansScreen() {
  const ready = useCg((s) => s.ready);
  const optedIn = useCg((s) => !!s.me?.optedIn);
  const plans = useCg((s) => s.feed?.plans ?? []);
  return (
    <Page>
      <Banners />
      <ScrollView>
        <Card>
          <Title>Plans</Title>
          {ready && !optedIn ? (
            <View style={{ padding: 16, gap: 8 }}>
              <Muted>
                Muse can find things to do with people who are into what you&apos;re into.
              </Muted>
              <Button title="Get started" onPress={() => go('/common-ground/setup')} />
            </View>
          ) : (
            <View style={{ padding: 16, gap: 12 }}>
              <MuseBar />
              <Label style={{ fontWeight: '700' }}>For you</Label>
              {plans.map((p) => (
                <PlanCard
                  key={p.planId}
                  plan={p}
                  onPress={() => go(`/common-ground/plan/${p.planId}`)}
                />
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </Page>
  );
}
