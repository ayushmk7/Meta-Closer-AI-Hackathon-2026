// "Met in person": opens the QR show/scan screen; lists who is verified (Attendee.verified).
import { View } from 'react-native';
import { Button, Card, Icon, Label, Muted, go, useColors } from '../../ui/native';
import type { Meetup } from './types';
import { personName } from './ui';

export default function VerifyButton({ m }: { m: Meetup }) {
  const c = useColors();
  const me = m.attendees.find((a) => a.isMe);
  // Only attendees still going, on a plan that happened or is about to; the code is owner-only.
  if (!m.verifyCode || me?.rsvp !== 'going' || !['confirmed', 'completed'].includes(m.status))
    return null;
  const names =
    m.attendees
      .filter((a) => !a.isMe && a.verified)
      .map((a) => personName(a.person).split(' ')[0])
      .join(', ') || 'your group';
  return (
    <Card style={{ padding: 16, gap: 10 }}>
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
        Met in person
      </Label>
      {me.verified ? (
        <View
          accessible
          accessibilityLabel={`Verified with ${names}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Icon name="checkmark-circle" size={22} color={c.online} />
          <Label style={{ flex: 1 }}>Verified with {names}</Label>
        </View>
      ) : (
        <Muted>Scan each other's code at the meetup so it counts for both of you.</Muted>
      )}
      <Button
        title={me.verified ? 'Verify someone else' : 'Show my code · scan theirs'}
        icon="qr-code-outline"
        secondary={!!me.verified}
        onPress={() => go(`/common-ground/scan/${m.meetupId}`)}
      />
    </Card>
  );
}
