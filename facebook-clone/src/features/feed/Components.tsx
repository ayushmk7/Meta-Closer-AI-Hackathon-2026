import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useDemo } from '../../core/store';
import type { Audience, Post, Reaction } from '../../core/types';
import { imageSource } from '../../data/media';
import { pickPhoto } from '../../platform/photo';
import { composerActions, postActions } from '../../extensions/registry';
import {
  Avatar,
  Button,
  Card,
  Divider,
  go,
  Icon,
  IconButton,
  Input,
  Label,
  Muted,
  reportError,
  Sheet,
  useColors,
} from '../../ui/native';

const audiences: Audience[] = ['Public', 'Friends', 'Only me'];
const reactions: { name: Reaction; glyph: string }[] = [
  { name: 'Like', glyph: '👍' },
  { name: 'Love', glyph: '❤️' },
  { name: 'Care', glyph: '🥰' },
  { name: 'Haha', glyph: '😆' },
  { name: 'Wow', glyph: '😮' },
  { name: 'Sad', glyph: '😢' },
  { name: 'Angry', glyph: '😡' },
];

export function Composer() {
  const demo = useDemo();
  const c = useColors();
  const me = demo.person(demo.seed.viewerId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [audience, setAudience] = useState<Audience>(demo.state.settings.audience);
  const [busy, setBusy] = useState(false);
  const [feeling, setFeeling] = useState(false);
  useEffect(() => {
    if (!open) setAudience(demo.state.settings.audience);
  }, [demo.state.settings.audience, open]);
  const choose = async () => {
    setOpen(true);
    setBusy(true);
    try {
      const selected = await pickPhoto();
      if (selected) setPhoto(selected);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  const composerContext = {
    demo,
    navigate: go,
    notify: (message: string) => Alert.alert('Local demo', message),
    selectPhoto: () => void choose(),
    openComposer: () => setOpen(true),
    chooseFeeling: () => setFeeling(!feeling),
  };
  const submit = () => {
    const id = demo.actions.createPost({ text, photo, audience });
    if (id) {
      setText('');
      setPhoto(undefined);
      setOpen(false);
    }
  };
  return (
    <>
      <Card style={{ borderRadius: 0 }}>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 11,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            onPress={() => go('/profile')}
          >
            <Avatar image={me.avatar} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a post"
            onPress={() => setOpen(true)}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: c.divider,
              borderRadius: 24,
              paddingHorizontal: 15,
              paddingVertical: 10,
            }}
          >
            <Label>What&apos;s on your mind?</Label>
          </Pressable>
          <IconButton
            name="images-outline"
            label="Add a photo to your post"
            onPress={() => void choose()}
            color="#45a757"
          />
        </View>
      </Card>
      <Sheet visible={open} title="Create post" onClose={() => setOpen(false)}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 16 }}
        >
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Avatar image={me.avatar} />
            <View style={{ flex: 1 }}>
              <Label style={{ fontWeight: '700' }}>{me.name}</Label>
              <Muted>Choose who can see this post</Muted>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {audiences.map((value) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: audience === value }}
                key={value}
                onPress={() => setAudience(value)}
                style={{
                  padding: 10,
                  borderRadius: 7,
                  backgroundColor: audience === value ? c.blue : c.input,
                }}
              >
                <Label style={{ color: audience === value ? '#fff' : c.text, fontSize: 13 }}>
                  {value}
                </Label>
              </Pressable>
            ))}
          </View>
          <Input
            accessibilityLabel="Post text"
            maxLength={5000}
            multiline
            value={text}
            onChangeText={setText}
            placeholder={`What's on your mind, ${me.name.split(' ')[0]}?`}
            style={{
              minHeight: 160,
              textAlignVertical: 'top',
              backgroundColor: c.card,
              borderRadius: 0,
              fontSize: 22,
              paddingHorizontal: 0,
            }}
          />
          {photo && (
            <View>
              <Image
                source={imageSource(photo)}
                accessibilityLabel="Selected photo preview"
                style={{ width: '100%', height: 240, borderRadius: 8 }}
              />
              <View
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  backgroundColor: c.card,
                  borderRadius: 30,
                }}
              >
                <IconButton
                  name="close"
                  label="Remove selected photo"
                  onPress={() => setPhoto(undefined)}
                />
              </View>
            </View>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {composerActions.map((action) => (
              <Button
                key={action.id}
                title={action.id === 'photo' && busy ? 'Preparing…' : action.label}
                icon={action.icon as React.ComponentProps<typeof Button>['icon']}
                secondary
                onPress={() => action.run(composerContext)}
                disabled={busy}
              />
            ))}
          </View>
          {feeling && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['happy', 'grateful', 'excited', 'relaxed'].map((value) => (
                <Button
                  key={value}
                  title={value}
                  secondary
                  onPress={() => {
                    setText((current) => `${current}${current ? ' — ' : ''}feeling ${value}.`);
                    setFeeling(false);
                  }}
                />
              ))}
            </View>
          )}
          <Button title="Post" onPress={submit} disabled={!text.trim() || busy} />
          <Muted>Posts stay in this local hackathon demo.</Muted>
        </ScrollView>
      </Sheet>
    </>
  );
}

export function StoryComposer({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const demo = useDemo();
  const [photo, setPhoto] = useState<string>();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const choose = async () => {
    setBusy(true);
    try {
      const image = await pickPhoto();
      if (image) setPhoto(image);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (!photo) return;
    const id = demo.actions.createStory({ image: photo, text: text.trim() });
    if (!id) return;
    setText('');
    setPhoto(undefined);
    onClose();
    go(`/stories/${id}`);
  };
  return (
    <Sheet visible={visible} title="Create story" onClose={onClose}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        {photo ? (
          <Image
            source={imageSource(photo)}
            accessibilityLabel="Your story preview"
            style={{ height: 330, width: '100%', borderRadius: 12 }}
          />
        ) : (
          <View style={{ height: 250, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Icon name="images-outline" size={48} />
            <Muted>Choose a photo from your library</Muted>
          </View>
        )}
        <Button
          title={busy ? 'Preparing photo…' : photo ? 'Change photo' : 'Choose photo'}
          onPress={() => void choose()}
          secondary
          disabled={busy}
        />
        <Input
          accessibilityLabel="Story caption"
          placeholder="Add a caption…"
          value={text}
          onChangeText={setText}
          maxLength={240}
        />
        <Button title="Share to story" onPress={submit} disabled={!photo || busy} />
        <Muted>Your story is saved only in this demo.</Muted>
      </ScrollView>
    </Sheet>
  );
}

export function Stories() {
  const demo = useDemo();
  const c = useColors();
  const me = demo.person(demo.seed.viewerId);
  const [create, setCreate] = useState(false);
  return (
    <Card style={{ borderRadius: 0 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, padding: 12 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create story"
          onPress={() => setCreate(true)}
          style={{
            width: 106,
            height: 178,
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: c.divider,
            backgroundColor: c.card,
          }}
        >
          <Image source={imageSource(me.avatar)} style={{ height: 126, width: '100%' }} />
          <View
            style={{
              alignSelf: 'center',
              backgroundColor: c.blue,
              marginTop: -17,
              borderWidth: 3,
              borderColor: c.card,
              borderRadius: 20,
              width: 34,
              height: 34,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="add" size={23} color="#fff" />
          </View>
          <Label style={{ textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 5 }}>
            Create story
          </Label>
        </Pressable>
        {demo.stories.map((story) => {
          const person = demo.person(story.authorId);
          return (
            <Pressable
              key={story.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${person.name}'s story`}
              onPress={() => go(`/stories/${story.id}`)}
              style={{
                width: 106,
                height: 178,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: '#30353b',
              }}
            >
              <Image
                source={imageSource(story.image)}
                style={{ position: 'absolute', height: '100%', width: '100%', opacity: 0.88 }}
              />
              <View
                style={{
                  margin: 8,
                  borderColor: c.blue,
                  borderWidth: 3,
                  borderRadius: 23,
                  alignSelf: 'flex-start',
                }}
              >
                <Avatar image={person.avatar} size={31} />
              </View>
              <Text
                numberOfLines={2}
                style={{
                  position: 'absolute',
                  left: 8,
                  bottom: 10,
                  right: 8,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: '700',
                  textShadowColor: '#000',
                  textShadowRadius: 4,
                }}
              >
                {person.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <StoryComposer visible={create} onClose={() => setCreate(false)} />
    </Card>
  );
}

export function PostCard({
  post,
  expanded = false,
  readOnly = false,
}: {
  post: Post;
  expanded?: boolean;
  readOnly?: boolean;
}) {
  const demo = useDemo();
  const c = useColors();
  const person = demo.person(post.authorId);
  const me = demo.person(demo.seed.viewerId);
  const reaction = demo.state.reactions[post.id];
  const surfaceContext = {
    demo,
    navigate: go,
    notify: (message: string) => Alert.alert('Local demo', message),
  };
  const [comments, setComments] = useState(expanded);
  const [comment, setComment] = useState('');
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const submitComment = () => {
    if (!comment.trim()) return;
    demo.actions.addComment(post.id, comment);
    setComment('');
  };
  const share = async () => {
    try {
      await Share.share({
        message: `Local Facebook demo post by ${person.name}:\n${post.text}\nfacebook-demo://posts/${post.id}`,
      });
    } catch (error) {
      reportError(error);
    }
  };
  return (
    <Card style={{ borderRadius: 0 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 12,
          paddingVertical: 10,
          paddingRight: 4,
          gap: 9,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${person.name}'s profile`}
          onPress={() => go(`/profile/${person.id}`)}
        >
          <Avatar image={person.avatar} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${person.name}'s profile`}
          onPress={() => go(`/profile/${person.id}`)}
          style={{ flex: 1 }}
        >
          <Label style={{ fontWeight: '700' }}>{person.name}</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Muted>{post.time} ·</Muted>
            <Icon
              name={
                post.audience === 'Public'
                  ? 'earth'
                  : post.audience === 'Only me'
                    ? 'lock-closed'
                    : 'people'
              }
              size={12}
              color={c.secondary}
            />
            <Muted>{post.audience}</Muted>
          </View>
        </Pressable>
        {!readOnly && (
          <IconButton
            name="ellipsis-horizontal"
            label={`Options for ${person.name}'s post`}
            onPress={() => setMenu(true)}
          />
        )}
      </View>
      <Pressable
        disabled={readOnly}
        accessibilityRole={readOnly ? undefined : 'button'}
        accessibilityLabel={readOnly ? undefined : 'Open post'}
        onPress={() => go(`/posts/${post.id}`)}
      >
        <Label style={{ paddingHorizontal: 12, paddingBottom: 12, lineHeight: 22 }}>
          {post.text}
        </Label>
      </Pressable>
      {post.photos.length === 1 && (
        <Pressable
          disabled={readOnly}
          accessibilityRole={readOnly ? undefined : 'button'}
          accessibilityLabel={readOnly ? undefined : 'Open photo post'}
          onPress={() => go(`/posts/${post.id}`)}
        >
          <Image
            source={imageSource(post.photos[0])}
            accessibilityLabel={post.text}
            style={{ width: '100%', aspectRatio: 1.2 }}
          />
        </Pressable>
      )}
      {post.photos.length > 1 && (
        <View style={{ flexDirection: 'row', height: 295, gap: 2 }}>
          <Pressable
            disabled={readOnly}
            style={{ flex: 1.2 }}
            onPress={() => go(`/posts/${post.id}`)}
            accessibilityRole="button"
            accessibilityLabel="Open photo collection"
          >
            <Image source={imageSource(post.photos[0])} style={{ width: '100%', height: '100%' }} />
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            {post.photos.slice(1, 3).map((photo, i) => (
              <Image
                key={`${photo}-${i}`}
                source={imageSource(photo)}
                accessibilityLabel={`Photo ${i + 2} from ${person.name}'s post`}
                style={{ width: '100%', flex: 1 }}
              />
            ))}
          </View>
        </View>
      )}
      {post.link && (
        <Pressable
          disabled={readOnly}
          accessibilityRole={readOnly ? undefined : 'button'}
          accessibilityLabel={readOnly ? undefined : `Open shared post: ${post.link.title}`}
          onPress={() => go(`/posts/${post.id}`)}
          style={{ backgroundColor: c.input }}
        >
          <Image source={imageSource(post.link.image)} style={{ width: '100%', height: 190 }} />
          <View style={{ padding: 12, gap: 3 }}>
            <Muted>{post.link.domain.toUpperCase()}</Muted>
            <Label style={{ fontSize: 18, fontWeight: '700' }}>{post.link.title}</Label>
            <Muted numberOfLines={2}>{post.link.description}</Muted>
          </View>
        </Pressable>
      )}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 12,
          paddingVertical: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 15 }}>👍❤️</Text>
        <Muted style={{ marginLeft: 4, flex: 1 }}>{post.reactionCount}</Muted>
        <Pressable
          accessibilityRole="button"
          onPress={() => setComments(!comments)}
          accessibilityLabel={`${post.comments.length} comments`}
        >
          <Muted>{post.comments.length} comments</Muted>
        </Pressable>
      </View>
      <View style={{ marginHorizontal: 12 }}>
        <Divider />
      </View>
      {!readOnly && (
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 8,
            alignItems: 'center',
            minHeight: 46,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reaction ? `Change ${reaction} reaction` : 'React to post'}
            onPress={() => setPicker(true)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            <Icon
              name={reaction ? 'thumbs-up' : 'thumbs-up-outline'}
              size={19}
              color={reaction ? c.blue : c.secondary}
            />
            <Label
              style={{ color: reaction ? c.blue : c.secondary, fontWeight: '600', fontSize: 13 }}
            >
              {reaction ?? 'Like'}
            </Label>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Comment on post"
            onPress={() => setComments(true)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            <Icon name="chatbubble-outline" size={19} color={c.secondary} />
            <Label style={{ color: c.secondary, fontWeight: '600', fontSize: 13 }}>Comment</Label>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share local demo post"
            onPress={() => void share()}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            <Icon name="arrow-redo-outline" size={19} color={c.secondary} />
            <Label style={{ color: c.secondary, fontWeight: '600', fontSize: 13 }}>Share</Label>
          </Pressable>
        </View>
      )}
      {(comments || readOnly) && (
        <View style={{ padding: 12, paddingTop: 4, gap: 12 }}>
          {post.comments.map((item) => (
            <View key={item.id} style={{ flexDirection: 'row', gap: 8 }}>
              <Avatar image={demo.person(item.authorId).avatar} size={32} />
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    backgroundColor: c.input,
                    borderRadius: 17,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Label style={{ fontSize: 13, fontWeight: '700' }}>
                    {demo.person(item.authorId).name}
                  </Label>
                  <Label>{item.text}</Label>
                </View>
                <Muted style={{ paddingLeft: 12, marginTop: 3 }}>{item.time}</Muted>
              </View>
            </View>
          ))}
          {!readOnly && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Avatar image={me.avatar} size={32} />
              <Input
                accessibilityLabel="Write a comment"
                maxLength={2000}
                placeholder="Write a comment…"
                value={comment}
                onChangeText={setComment}
                returnKeyType="send"
                onSubmitEditing={submitComment}
                style={{ flex: 1 }}
              />
              <IconButton
                name="send"
                label="Send comment"
                onPress={submitComment}
                color={comment.trim() ? c.blue : c.secondary}
              />
            </View>
          )}
        </View>
      )}
      {!readOnly && (
        <Sheet visible={picker} title="React to post" onClose={() => setPicker(false)}>
          <View style={{ padding: 20, gap: 8 }}>
            {reactions.map((item) => (
              <Pressable
                key={item.name}
                accessibilityRole="button"
                accessibilityState={{ selected: reaction === item.name }}
                onPress={() => {
                  demo.actions.toggleReaction(post.id, item.name);
                  setPicker(false);
                }}
                style={{
                  minHeight: 48,
                  padding: 10,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  backgroundColor: reaction === item.name ? c.input : c.card,
                }}
              >
                <Text style={{ fontSize: 26 }}>{item.glyph}</Text>
                <Label style={{ flex: 1 }}>{item.name}</Label>
                {reaction === item.name && <Icon name="checkmark-circle" color={c.blue} />}
              </Pressable>
            ))}
            <Muted>Select your current reaction again to remove it.</Muted>
          </View>
        </Sheet>
      )}
      {!readOnly && (
        <Sheet visible={menu} title="Post options" onClose={() => setMenu(false)}>
          <View style={{ padding: 16, gap: 12 }}>
            <View style={{ gap: 12 }}>
              {postActions.map((action) => (
                <Button
                  key={action.id}
                  title={action.label(surfaceContext, post)}
                  secondary
                  icon={action.icon as React.ComponentProps<typeof Button>['icon']}
                  onPress={() => {
                    setMenu(false);
                    action.run(surfaceContext, post);
                  }}
                />
              ))}
            </View>
            <Button
              title="Share local post"
              secondary
              icon="arrow-redo-outline"
              onPress={() => {
                setMenu(false);
                void share();
              }}
            />
          </View>
        </Sheet>
      )}
    </Card>
  );
}
