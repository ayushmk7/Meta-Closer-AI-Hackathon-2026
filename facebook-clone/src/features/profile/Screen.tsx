import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageSource } from '../../data/media';
import { pickPhoto } from '../../platform/photo';
import {
  Avatar,
  Button,
  Card,
  Chips,
  Divider,
  Empty,
  go,
  Icon,
  IconButton,
  Input,
  Label,
  Muted,
  Page,
  reportError,
  Sheet,
  useColors,
} from '../../ui/native';
import { Composer, PostCard } from '../feed';
import { StoryComposer } from '../feed/Components';

function selectedTab(value?: string) {
  return (
    ['Posts', 'About', 'Friends', 'Photos'].find(
      (tab) => tab.toLowerCase() === value?.toLowerCase(),
    ) ?? 'Posts'
  );
}
export default function ProfileScreen() {
  const demo = useDemo();
  const c = useColors();
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const id = params.id ?? demo.seed.viewerId;
  const person = demo.person(id);
  const own = id === demo.seed.viewerId;
  const [tab, setTab] = useState(selectedTab(params.tab));
  const [edit, setEdit] = useState(false);
  const [more, setMore] = useState(false);
  const [viewAs, setViewAs] = useState(false);
  const [createStory, setCreateStory] = useState(false);
  const [bio, setBio] = useState(person.bio);
  const [location, setLocation] = useState(person.location);
  const [avatar, setAvatar] = useState(person.avatar);
  const [cover, setCover] = useState(person.cover ?? person.avatar);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setTab(selectedTab(params.tab));
    setViewAs(false);
  }, [id, params.tab]);
  const authored = demo.posts.filter(
    (post) => post.authorId === id && (!viewAs || post.audience === 'Public'),
  );
  const photos = [
    ...new Set(
      [person.cover, person.avatar, ...authored.flatMap((post) => post.photos)].filter(
        (image): image is string => !!image,
      ),
    ),
  ];
  const startEdit = () => {
    setBio(person.bio);
    setLocation(person.location);
    setAvatar(person.avatar);
    setCover(person.cover ?? person.avatar);
    setEdit(true);
  };
  const choose = async (field: 'avatar' | 'cover') => {
    setBusy(true);
    try {
      const image = await pickPhoto();
      if (image) (field === 'avatar' ? setAvatar : setCover)(image);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  if (!demo.seed.people.some((item) => item.id === id))
    return (
      <Empty
        title="Profile not found"
        message="Search for one of the fictional people in this demo."
      />
    );
  const friendCards = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 }}>
      {demo.friends.map((friend) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${friend.name}'s profile`}
          key={friend.id}
          onPress={() => go(`/profile/${friend.id}`)}
          style={{ width: '30.5%', gap: 5 }}
        >
          <Image
            source={imageSource(friend.avatar)}
            style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }}
          />
          <Label numberOfLines={2} style={{ fontSize: 12, fontWeight: '600' }}>
            {friend.name}
          </Label>
        </Pressable>
      ))}
    </View>
  );
  return (
    <>
      <Page>
        <Card style={{ borderRadius: 0 }}>
          <Image
            source={imageSource(person.cover ?? person.avatar)}
            accessibilityLabel={`${person.name}'s cover photo`}
            style={{ width: '100%', height: 185 }}
          />
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <View
              style={{
                marginTop: -66,
                borderWidth: 5,
                borderColor: c.card,
                borderRadius: 90,
                width: 152,
                height: 152,
              }}
            >
              <Avatar image={person.avatar} size={142} label={`${person.name}'s profile photo`} />
            </View>
            <Label
              accessibilityRole="header"
              style={{ fontWeight: '800', fontSize: 29, lineHeight: 35, marginTop: 9 }}
            >
              {person.name}
            </Label>
            <Muted style={{ marginTop: 4 }}>
              {own ? `${demo.friends.length} friends` : person.location}
            </Muted>
            <Label style={{ marginTop: 10 }}>{person.bio}</Label>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              {own && !viewAs ? (
                <>
                  <Button
                    title="Add to story"
                    icon="add"
                    onPress={() => setCreateStory(true)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Edit profile"
                    icon="pencil"
                    onPress={startEdit}
                    secondary
                    style={{ flex: 1 }}
                  />
                </>
              ) : !own ? (
                <>
                  <Button
                    title={
                      demo.friends.some((friend) => friend.id === id)
                        ? 'Friends'
                        : demo.state.sentRequestIds.includes(id)
                          ? 'Requested'
                          : 'Add friend'
                    }
                    icon="person-add"
                    onPress={() => demo.actions.requestFriend(id)}
                    disabled={
                      demo.friends.some((friend) => friend.id === id) ||
                      demo.state.sentRequestIds.includes(id)
                    }
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Message"
                    icon="chatbubble"
                    onPress={() => go(`/messages/${demo.conversationFor(id)}`)}
                    secondary
                    style={{ flex: 1 }}
                  />
                </>
              ) : (
                <Button
                  title="Exit public preview"
                  onPress={() => setViewAs(false)}
                  style={{ flex: 1 }}
                />
              )}
              <View style={{ backgroundColor: c.input, borderRadius: 7 }}>
                <IconButton
                  name="ellipsis-horizontal"
                  label="Profile options"
                  onPress={() => setMore(true)}
                />
              </View>
            </View>
          </View>
        </Card>
        {viewAs && (
          <Card style={{ padding: 16 }}>
            <Label style={{ fontWeight: '700' }}>Viewing your public profile</Label>
            <Muted>Only posts with a Public audience appear in this local preview.</Muted>
          </Card>
        )}
        {tab === 'Posts' && own && !viewAs && (
          <Card style={{ borderRadius: 0 }}>
            <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
              <Label style={{ fontWeight: '700', flex: 1 }}>People you may know</Label>
              <Pressable
                onPress={() => go('/friends?section=Suggestions')}
                accessibilityRole="button"
              >
                <Label style={{ color: c.blue }}>See all</Label>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 14, gap: 10 }}
            >
              {demo.seed.suggestions.map((personId) => {
                const suggestion = demo.person(personId);
                const confirmed = demo.friends.some((friend) => friend.id === personId);
                return (
                  <View
                    key={personId}
                    style={{
                      width: 142,
                      borderWidth: 1,
                      borderColor: c.divider,
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${suggestion.name}'s profile`}
                      onPress={() => go(`/profile/${personId}`)}
                    >
                      <Image
                        source={imageSource(suggestion.avatar)}
                        style={{ width: 142, height: 132 }}
                      />
                      <Label numberOfLines={1} style={{ fontWeight: '600', padding: 8 }}>
                        {suggestion.name}
                      </Label>
                    </Pressable>
                    <Button
                      style={{ marginHorizontal: 7, marginBottom: 7 }}
                      secondary
                      title={
                        confirmed
                          ? 'Friends'
                          : demo.state.sentRequestIds.includes(personId)
                            ? 'Requested'
                            : 'Add friend'
                      }
                      onPress={() => demo.actions.requestFriend(personId)}
                      disabled={confirmed || demo.state.sentRequestIds.includes(personId)}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </Card>
        )}
        <Card style={{ borderRadius: 0, paddingTop: 10 }}>
          <Chips
            items={['Posts', 'About', 'Friends', 'Photos', 'More']}
            value={tab}
            onChange={(value) => (value === 'More' ? setMore(true) : setTab(value))}
          />
        </Card>
        {(tab === 'Posts' || tab === 'About') && (
          <Card style={{ padding: 16, gap: 10 }}>
            <Label accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700' }}>
              Intro
            </Label>
            <Label>{person.bio}</Label>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="home" color={c.secondary} size={19} />
              <Label>
                Lives in <Label style={{ fontWeight: '600' }}>{person.location}</Label>
              </Label>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="heart" color={c.secondary} size={19} />
              <Label>Making time for the little things</Label>
            </View>
            {own && !viewAs && <Button title="Edit details" secondary onPress={startEdit} />}
          </Card>
        )}
        {(tab === 'Friends' || tab === 'Posts') && (
          <Card>
            <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
              <Label style={{ fontSize: 20, fontWeight: '700' }}>Friends</Label>
              <Muted>{demo.friends.length} friends in this demo</Muted>
            </View>
            {friendCards}
            {tab === 'Friends' && (
              <View style={{ padding: 12 }}>
                <Button title="Find friends" onPress={() => go('/friends')} secondary />
              </View>
            )}
          </Card>
        )}
        {tab === 'Photos' && (
          <Card>
            <View style={{ padding: 14 }}>
              <Label style={{ fontSize: 20, fontWeight: '700' }}>Photos</Label>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
              {photos.map((photo, index) => (
                <Image
                  key={`${photo}-${index}`}
                  source={imageSource(photo)}
                  accessibilityLabel={`${person.name}'s photo ${index + 1}`}
                  style={{ width: '32.7%', aspectRatio: 1 }}
                />
              ))}
            </View>
          </Card>
        )}
        {tab === 'Posts' && (
          <>
            {own && !viewAs && <Composer />}
            {authored.length ? (
              authored.map((post) => <PostCard key={post.id} post={post} readOnly={viewAs} />)
            ) : (
              <Card>
                <Empty
                  title="No posts to show"
                  message={
                    viewAs
                      ? 'Your Public posts will appear here.'
                      : 'New posts from this person will appear here.'
                  }
                />
              </Card>
            )}
          </>
        )}
      </Page>
      <Sheet visible={edit} title="Edit profile" onClose={() => setEdit(false)}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 16 }}
        >
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Avatar image={avatar} size={100} />
            <Button
              title="Change profile photo"
              secondary
              onPress={() => void choose('avatar')}
              disabled={busy}
            />
          </View>
          <Image
            source={imageSource(cover)}
            style={{ width: '100%', height: 140, borderRadius: 8 }}
          />
          <Button
            title="Change cover photo"
            secondary
            onPress={() => void choose('cover')}
            disabled={busy}
          />
          <Label style={{ fontWeight: '700' }}>Bio</Label>
          <Input
            accessibilityLabel="Profile bio"
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={200}
          />
          <Label style={{ fontWeight: '700' }}>Location</Label>
          <Input
            accessibilityLabel="Profile location"
            value={location}
            onChangeText={setLocation}
            maxLength={100}
          />
          <Button
            title="Save profile"
            disabled={busy || !bio.trim() || !location.trim()}
            onPress={() => {
              demo.actions.updateProfile({
                bio: bio.trim(),
                location: location.trim(),
                avatar,
                cover,
              });
              setEdit(false);
            }}
          />
        </ScrollView>
      </Sheet>
      <Sheet visible={more} title="Profile options" onClose={() => setMore(false)}>
        <View style={{ padding: 16, gap: 12 }}>
          {own && (
            <Button
              title={viewAs ? 'Exit public preview' : 'View as public'}
              secondary
              icon="eye-outline"
              onPress={() => {
                setViewAs(!viewAs);
                setMore(false);
                setTab('Posts');
              }}
            />
          )}
          <Button
            title="About"
            secondary
            onPress={() => {
              setTab('About');
              setMore(false);
            }}
          />
          <Button
            title="Photos"
            secondary
            onPress={() => {
              setTab('Photos');
              setMore(false);
            }}
          />
          <Divider />
          <Button
            title="Audience and visibility"
            secondary
            onPress={() => {
              setMore(false);
              go('/settings/audience');
            }}
          />
        </View>
      </Sheet>
      <StoryComposer visible={createStory} onClose={() => setCreateStory(false)} />
    </>
  );
}
