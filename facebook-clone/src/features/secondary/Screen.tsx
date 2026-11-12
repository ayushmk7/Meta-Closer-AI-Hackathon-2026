import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageSource } from '../../data/media';
import { eventSources } from '../../extensions/registry';
import {
  Button,
  Card,
  Chips,
  Empty,
  ExternalRowItem,
  go,
  Icon,
  Label,
  Muted,
  Page,
  Title,
  useColors,
} from '../../ui/native';
import { PostCard } from '../feed';
export default function SecondaryScreen() {
  const demo = useDemo();
  const c = useColors();
  const path = usePathname().split('/')[1];
  const { event: eventId } = useLocalSearchParams<{ event?: string }>();
  // Called unconditionally in registry order; the source count never changes at runtime.
  const sources = eventSources.map((source) => ({ ...source, rows: source.useRows() }));
  const [groupId, setGroupId] = useState(demo.seed.groups[0]?.id ?? '');
  const titles: Record<string, string> = {
    video: 'Video',
    groups: 'Groups',
    memories: 'Memories',
    saved: 'Saved',
    feeds: 'Feeds',
    events: 'Events',
    privacy: 'Privacy Checkup',
  };
  if (path === 'privacy')
    return (
      <Page>
        <Card style={{ padding: 22, gap: 18, alignItems: 'center' }}>
          <Icon name="shield-checkmark" size={64} color={c.blue} />
          <Label
            accessibilityRole="header"
            style={{ fontSize: 27, lineHeight: 32, fontWeight: '800', textAlign: 'center' }}
          >
            Privacy Checkup
          </Label>
          <Label style={{ textAlign: 'center' }}>
            Choose who sees what you share and which updates you want to receive.
          </Label>
          <Muted style={{ textAlign: 'center' }}>
            This is an offline demonstration. Your audience controls change this demo&apos;s public
            profile preview. They do not change a real Facebook account.
          </Muted>
          <Button
            title={`Default audience: ${demo.state.settings.audience}`}
            secondary
            onPress={() => go('/settings/audience')}
            style={{ alignSelf: 'stretch' }}
          />
          <Button
            title="Review notification preferences"
            secondary
            onPress={() => go('/settings/notifications')}
            style={{ alignSelf: 'stretch' }}
          />
          <Button
            title="View your profile"
            onPress={() => go('/profile')}
            style={{ alignSelf: 'stretch' }}
          />
        </Card>
      </Page>
    );
  const selectedGroup = demo.seed.groups.find((group) => group.id === groupId);
  const posts =
    path === 'saved'
      ? demo.posts.filter((post) => demo.state.savedPostIds.includes(post.id))
      : path === 'memories'
        ? demo.posts.filter((post) => ['post-03', 'post-05', 'post-07'].includes(post.id))
        : path === 'groups'
          ? demo.posts.filter((post) => selectedGroup?.postIds.includes(post.id))
          : demo.posts;
  return (
    <Page>
      <Card style={{ borderRadius: 0 }}>
        <Title>{titles[path] ?? 'Explore'}</Title>
        {path === 'feeds' && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
            <Muted>
              {demo.state.settings.feedOrder === 'curated'
                ? 'Curated order · your community, together'
                : 'Most recent · sorted by saved timestamps'}
            </Muted>
            <Button title="Feed preferences" secondary onPress={() => go('/settings/feed')} />
          </View>
        )}
        {path === 'memories' && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Muted>A few favorite moments from this fixed demo feed.</Muted>
          </View>
        )}
        {path === 'saved' && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
            <Muted>{posts.length} saved posts</Muted>
            <Button
              title={`Marketplace saved listings (${demo.state.savedListingIds.length})`}
              secondary
              onPress={() => go('/marketplace')}
            />
          </View>
        )}
        {path === 'video' && (
          <Muted style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            Local photo highlights from your friends. Streaming isn&apos;t part of this demo.
          </Muted>
        )}
      </Card>
      {path === 'groups' && (
        <>
          <Card>
            <Chips
              items={demo.seed.groups.map((group) => group.name)}
              value={selectedGroup?.name ?? ''}
              onChange={(name) =>
                setGroupId(demo.seed.groups.find((group) => group.name === name)?.id ?? '')
              }
            />
            {selectedGroup && (
              <>
                <Image
                  source={imageSource(selectedGroup.image)}
                  accessibilityLabel={selectedGroup.name}
                  style={{ width: '100%', height: 190 }}
                />
                <View style={{ padding: 16, gap: 8 }}>
                  <Label style={{ fontSize: 21, fontWeight: '700' }}>{selectedGroup.name}</Label>
                  <Label>{selectedGroup.description}</Label>
                  <Muted>Community posts</Muted>
                </View>
              </>
            )}
          </Card>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </>
      )}
      {path === 'events' && eventId && !demo.seed.events.some((event) => event.id === eventId) && (
        <Card>
          <Empty title="Event not found" message="Return to Events to see the local meetups." />
          <View style={{ padding: 16 }}>
            <Button title="All events" secondary onPress={() => go('/events')} />
          </View>
        </Card>
      )}
      {path === 'events' &&
        !eventId &&
        sources
          .filter((source) => source.rows.length > 0)
          .map((source) => (
            <Card key={source.id}>
              <Label style={{ fontSize: 17, fontWeight: '700', padding: 16 }}>{source.label}</Label>
              {source.rows.map((row) => (
                <ExternalRowItem key={row.id} row={row} />
              ))}
            </Card>
          ))}
      {path === 'events' &&
        demo.seed.events
          .filter((event) => !eventId || event.id === eventId)
          .map((event) => (
            <Card key={event.id}>
              <Image
                source={imageSource(event.image)}
                accessibilityLabel={event.title}
                style={{ width: '100%', height: 200 }}
              />
              <View style={{ padding: 16, gap: 7 }}>
                <Label style={{ color: c.badge, fontSize: 13, fontWeight: '700' }}>
                  {event.date}
                </Label>
                <Label style={{ fontSize: 21, lineHeight: 27, fontWeight: '700' }}>
                  {event.title}
                </Label>
                <Muted>{event.location}</Muted>
                <Label>{event.description}</Label>
                <Button title="Find friends to go with" secondary onPress={() => go('/friends')} />
              </View>
            </Card>
          ))}
      {path === 'video' &&
        demo.posts
          .filter((post) => post.photos.length)
          .map((post) => (
            <Card key={post.id}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${demo.person(post.authorId).name}'s photo highlight`}
                onPress={() => go(`/posts/${post.id}`)}
              >
                <Image
                  source={imageSource(post.photos[0])}
                  style={{ width: '100%', height: 230 }}
                />
                <View style={{ padding: 15, gap: 5 }}>
                  <Label style={{ fontWeight: '700', fontSize: 17 }}>
                    {demo.person(post.authorId).name}&apos;s highlight
                  </Label>
                  <Muted numberOfLines={2}>{post.text}</Muted>
                  <Label style={{ color: c.blue, fontWeight: '600' }}>View photo post</Label>
                </View>
              </Pressable>
            </Card>
          ))}
      {['saved', 'memories', 'feeds'].includes(path) &&
        (posts.length ? (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <Card>
            <Empty
              title="Nothing saved yet"
              message="Use Save post in a post's menu to collect it here."
            />
          </Card>
        ))}
    </Page>
  );
}
