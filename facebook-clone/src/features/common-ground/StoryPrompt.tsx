// Meetup: after a meetup I went to, offer to add it to my own Facebook story. Venue photo and
// plan title only, never people (CONTRACTS Decisions "Stories after the event"). The server
// keeps photoUrl null for sensitive venues, so no photo means no offer.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { usePostStory } from '../../extensions/story';
import { Button, Card, Icon, IconButton, Label, Muted, go, useColors } from '../../ui/native';
import { photoSource } from './PlanCard';
import { getState, setState, useCg } from './store';
import { when } from './time';
import type { Meetup } from './types';
import { Pop, enter } from './ui';

export default function StoryPrompt({ m }: { m: Meetup }) {
  const c = useColors();
  const post = usePostStory();
  const done = useCg((s) => s.storyPrompt[m.meetupId]);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null);
  const photo = m.venue.photoUrl;
  const went = m.attendees.some((a) => a.isMe && a.rsvp === 'going');
  if (m.status !== 'completed' || !went || !photo || (done && !storyId)) return null;
  const mark = (v: 'posted' | 'dismissed') =>
    setState({ storyPrompt: { ...getState().storyPrompt, [m.meetupId]: v } });
  if (storyId)
    return (
      <Pop>
        <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="checkmark-circle" size={22} color={c.online} />
          <Label accessibilityLiveRegion="polite" style={{ flex: 1 }}>
            Added to your story
          </Label>
          <Pressable
            accessibilityRole="link"
            onPress={() => go(`/stories/${storyId}`)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Label style={{ color: c.blue, fontWeight: '600' }}>View story</Label>
          </Pressable>
        </Card>
      </Pop>
    );
  const share = async () => {
    setSending(true);
    setFailed(false);
    // asset:<key> is the mock's media key; a live URL is copied by the shell.
    const id = await post({
      image: photo.startsWith('asset:') ? photo.slice(6) : photo,
      text: m.title,
    });
    setSending(false);
    if (!id) return setFailed(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStoryId(id);
    mark('posted');
  };
  const sub = [when(m.startsAt).split(' · ')[0], m.venue.neighborhood].filter(Boolean).join(' · ');
  return (
    <Animated.View entering={enter(0)}>
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Label accessibilityRole="header" style={{ flex: 1, fontSize: 17, fontWeight: '700' }}>
            Add to your story
          </Label>
          <IconButton name="close" label="Not now" onPress={() => mark('dismissed')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Image
            accessibilityLabel={`Photo of ${m.venue.name}`}
            source={photoSource(photo)}
            contentFit="cover"
            style={{ width: 64, height: 96, borderRadius: 8, backgroundColor: c.input }}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Label numberOfLines={2} style={{ fontWeight: '600' }}>
              {m.title}
            </Label>
            {!!sub && <Muted>{sub}</Muted>}
            <Muted>Only the place and the meetup name.</Muted>
          </View>
        </View>
        {failed && (
          <Muted accessibilityLiveRegion="polite">Couldn't add it to your story. Try again.</Muted>
        )}
        <Button
          title={sending ? 'Sharing…' : 'Share to story'}
          accessibilityLabel="Share to story"
          secondary={m.feedbackDue}
          disabled={sending}
          onPress={() => void share()}
        />
      </Card>
    </Animated.View>
  );
}
