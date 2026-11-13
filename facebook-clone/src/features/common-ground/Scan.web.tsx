// Verify in person, web: my code as text + typed entry of theirs (no camera, no network beyond the mock).
// ponytail: native Scan.tsx imports ScanPage from here and adds the QR and the camera as children.
import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Icon, Input, Label, Muted, Page, Title, useColors } from '../../ui/native';
import { noteVerified } from './Quests';
import { load, useCg, verifyAttendee } from './store';
import type { VerifyResult } from './types';
import { Banners, NotFound, personName, usePoll } from './ui';

const REASON: Record<string, string> = {
  invalid_code: "That code doesn't match anyone on this plan.",
  not_attendee: "That person isn't on this plan.",
  outside_window: 'Codes work only around the meetup time.',
  self: "That's your own code. Scan theirs instead.",
};
export const resultText = (r: VerifyResult) =>
  r.accepted
    ? r.person
      ? `You and ${personName(r.person).split(' ')[0]} are verified.`
      : "You're verified."
    : (REASON[r.reason ?? ''] ?? "That code didn't work. Try again.");

// One submit at a time, so a camera that reads the same QR many times a second sends it once.
export function useVerify(meetupId: string) {
  const busy = useRef(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const submit = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || busy.current) return;
    busy.current = true;
    const r = await verifyAttendee(meetupId, code);
    busy.current = false;
    if (r) setResult(r);
    if (r?.accepted) void noteVerified(); // Quests: "Verify in person"
    return !!r?.accepted;
  };
  return { result, submit };
}

export function ScanPage({
  qr,
  camera,
}: {
  qr?: (code: string) => ReactNode;
  camera?: (submit: (code: string) => void) => ReactNode;
}) {
  const c = useColors();
  const { meetupId = '' } = useLocalSearchParams<{ meetupId: string }>();
  const m = useCg((s) => s.meetups[meetupId]);
  const ready = useCg((s) => s.ready);
  const [typed, setTyped] = useState('');
  const { result, submit } = useVerify(meetupId);
  // A second submit after success would verify the next attendee: clear the field, hide Verify.
  const confirm = async () => void ((await submit(typed)) && setTyped(''));
  usePoll(() => void load.meetup(meetupId), 0);

  if (!m?.verifyCode)
    return (
      <Page>
        <Banners />
        {ready && <NotFound title="This code isn't available" />}
      </Page>
    );
  const done = !!result?.accepted;
  return (
    <Page>
      <Banners />
      <Title>Verify in person</Title>
      <Card style={{ padding: 16, gap: 12, alignItems: 'center' }}>
        <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
          Your code
        </Label>
        {qr?.(m.verifyCode)}
        <Label
          accessibilityLabel={`Your code ${m.verifyCode.split('').join(' ')}`}
          style={{ fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: 6 }}
          selectable
        >
          {m.verifyCode}
        </Label>
        <Muted style={{ textAlign: 'center' }}>
          {qr ? 'Let them scan this or type it in.' : 'Read this out so they can type it in.'}
        </Muted>
      </Card>

      {!done && camera?.(submit)}

      <Card style={{ padding: 16, gap: 10 }}>
        <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
          Enter their code
        </Label>
        {!done && (
          <>
            <Input
              accessibilityLabel="Their code"
              placeholder="Their 6-character code"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={64}
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={() => void confirm()}
            />
            <Button title="Verify" disabled={!typed.trim()} onPress={() => void confirm()} />
          </>
        )}
        {result && (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Icon
              name={result.accepted ? 'checkmark-circle' : 'alert-circle'}
              size={22}
              color={result.accepted ? c.online : c.secondary}
            />
            <Label style={{ flex: 1 }}>{resultText(result)}</Label>
          </View>
        )}
        {done && <Button title="Back to the plan" onPress={() => router.back()} />}
      </Card>
    </Page>
  );
}

export default function ScanScreen() {
  return <ScanPage />;
}
