// Meetup: share a completed plan to Explore. Anonymous by contract: caption plus the venue photo.
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Input, Label, Muted, go } from '../../ui/native';
import { shareMeetup } from './store';
import type { Meetup } from './types';

const MAX = 140;

export default function ShareMeetup({ m }: { m: Meetup }) {
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [shared, setShared] = useState(false);
  const went = m.attendees.some((a) => a.isMe && a.rsvp === 'going');
  if (m.status !== 'completed' || !went) return null;
  if (shared)
    return (
      <Card style={{ padding: 16, gap: 8 }}>
        <Label accessibilityLiveRegion="polite" style={{ fontWeight: '700' }}>
          Shared to Explore
        </Label>
        <Button title="See it in Explore" secondary onPress={() => go('/common-ground/explore')} />
      </Card>
    );
  const send = async () => {
    setSending(true);
    const ok = await shareMeetup(m.meetupId, caption.trim());
    setSending(false);
    if (ok) setShared(true); // a failed share keeps the caption
  };
  return (
    <Card style={{ padding: 16, gap: 8 }}>
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
        Share to Explore
      </Label>
      <Muted>Others see the place, the activity and your caption. Never names or faces.</Muted>
      <Input
        accessibilityLabel="Caption"
        placeholder="Add a caption"
        value={caption}
        onChangeText={setCaption}
        maxLength={MAX}
        multiline
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Muted style={{ flex: 1 }}>
          {caption.length}/{MAX}
        </Muted>
        <Button
          title="Share to Explore"
          disabled={sending || !caption.trim()}
          onPress={() => void send()}
        />
      </View>
    </Card>
  );
}
