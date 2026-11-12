import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import {
  Avatar,
  Button,
  Card,
  Chips,
  Divider,
  Empty,
  go,
  Label,
  Muted,
  Page,
  Title,
  useColors,
} from '../../ui/native';
import { PostCard } from '../feed';
const sections = ['Home', 'Requests', 'Suggestions', 'All friends', 'Birthdays'];
function selectedSection(value?: string) {
  return value?.toLowerCase() === 'all'
    ? 'All friends'
    : (sections.find((section) => section.toLowerCase() === value?.toLowerCase()) ?? 'Home');
}
export default function FriendsScreen() {
  const demo = useDemo();
  const c = useColors();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState(selectedSection(params.section));
  useEffect(() => {
    setSection(selectedSection(params.section));
  }, [params.section]);
  return (
    <Page>
      <Card style={{ borderRadius: 0 }}>
        <Title>Friends</Title>
        <Chips items={sections} value={section} onChange={setSection} />
        <Divider />
        {(section === 'Home' || section === 'Requests') && (
          <>
            <View style={{ padding: 16, flexDirection: 'row', gap: 8 }}>
              <Label accessibilityRole="header" style={{ fontWeight: '700', fontSize: 20 }}>
                Friend requests
              </Label>
              <Label style={{ color: c.badge, fontWeight: '700', fontSize: 20 }}>
                {demo.requests.length}
              </Label>
            </View>
            {demo.requests.map((request) => {
              const person = demo.person(request.personId);
              return (
                <View
                  key={request.id}
                  style={{
                    flexDirection: 'row',
                    paddingHorizontal: 12,
                    paddingBottom: 17,
                    gap: 12,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${person.name}'s profile`}
                    onPress={() => go(`/profile/${person.id}`)}
                  >
                    <Avatar image={person.avatar} size={80} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 5 }}>
                    <Pressable onPress={() => go(`/profile/${person.id}`)}>
                      <Label style={{ fontWeight: '700', fontSize: 16 }}>{person.name}</Label>
                    </Pressable>
                    <Muted>{request.mutual} mutual friends</Muted>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                      <Button
                        title="Confirm"
                        accessibilityLabel={`Confirm ${person.name}`}
                        onPress={() => demo.actions.decideRequest(request.id, 'confirmed')}
                        style={{ flex: 1 }}
                      />
                      <Button
                        title="Delete"
                        accessibilityLabel={`Delete ${person.name}'s request`}
                        secondary
                        onPress={() => demo.actions.decideRequest(request.id, 'deleted')}
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
            {!demo.requests.length && (
              <Empty
                title="You're all caught up"
                message="There are no pending friend requests in this demo."
              />
            )}
          </>
        )}
        {(section === 'Home' || section === 'Suggestions') && (
          <>
            <View style={{ padding: 16 }}>
              <Label accessibilityRole="header" style={{ fontWeight: '700', fontSize: 20 }}>
                People you may know
              </Label>
            </View>
            {demo.seed.suggestions.map((id) => {
              const person = demo.person(id);
              const sent = demo.state.sentRequestIds.includes(id);
              const confirmed = demo.friends.some((friend) => friend.id === id);
              return (
                <View
                  key={id}
                  style={{
                    flexDirection: 'row',
                    paddingHorizontal: 12,
                    paddingBottom: 17,
                    gap: 12,
                  }}
                >
                  <Pressable
                    onPress={() => go(`/profile/${id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${person.name}'s profile`}
                  >
                    <Avatar image={person.avatar} size={72} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Label style={{ fontWeight: '700' }}>{person.name}</Label>
                    <Muted>{person.location}</Muted>
                    <Button
                      title={confirmed ? 'Friends' : sent ? 'Requested' : 'Add friend'}
                      onPress={() => demo.actions.requestFriend(id)}
                      disabled={confirmed || sent}
                      secondary
                    />
                  </View>
                </View>
              );
            })}
          </>
        )}
        {section === 'All friends' && (
          <>
            <View style={{ padding: 16 }}>
              <Label style={{ fontWeight: '700', fontSize: 20 }}>
                {demo.friends.length} friends
              </Label>
            </View>
            {demo.friends.map((person) => (
              <Pressable
                key={person.id}
                onPress={() => go(`/profile/${person.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${person.name}'s profile`}
                style={{ flexDirection: 'row', padding: 14, gap: 12, alignItems: 'center' }}
              >
                <Avatar image={person.avatar} size={56} online={person.online} />
                <View style={{ flex: 1 }}>
                  <Label style={{ fontWeight: '700' }}>{person.name}</Label>
                  <Muted>{person.location}</Muted>
                </View>
              </Pressable>
            ))}
          </>
        )}
        {section === 'Birthdays' && (
          <Empty
            title="No upcoming birthdays"
            message="There are no birthday reminders in this fixed demo. Visit Events for local meetups."
          />
        )}
      </Card>
      {section === 'Home' && (
        <>
          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <Label style={{ fontSize: 20, fontWeight: '700' }}>From your friends</Label>
          </View>
          {demo.posts
            .filter((post) => demo.friends.some((person) => person.id === post.authorId))
            .slice(0, 3)
            .map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
        </>
      )}
    </Page>
  );
}
