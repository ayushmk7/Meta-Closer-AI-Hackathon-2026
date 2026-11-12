import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { inboxSources } from '../../extensions/registry';
import {
  Avatar,
  Card,
  Empty,
  ExternalRowItem,
  go,
  IconButton,
  Input,
  Label,
  Muted,
  Page,
  Title,
  useColors,
  useKeyboardOffset,
} from '../../ui/native';
export default function MessengerScreen() {
  const demo = useDemo();
  const c = useColors();
  const keyboardOffset = useKeyboardOffset();
  const { id, listing: listingId } = useLocalSearchParams<{ id?: string; listing?: string }>();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const scroll = useRef<ScrollView>(null);
  // Called unconditionally in registry order; the source count never changes at runtime.
  const sources = inboxSources.map((source) => ({ ...source, rows: source.useRows() }));
  const listing = demo.seed.listings.find((item) => item.id === listingId);
  useEffect(() => {
    setText(listing ? `Hi, is ${listing.title.toLowerCase()} still available?` : '');
  }, [id, listing]);
  const contactIds = [
    ...new Set([
      ...demo.seed.conversations.map((conversation) => conversation.personId),
      ...demo.seed.contacts,
      ...demo.friends.map((person) => person.id),
      ...demo.seed.listings.map((item) => item.sellerId),
    ]),
  ];
  if (!id)
    return (
      <Page>
        <Card style={{ borderRadius: 0 }}>
          <Title>Chats</Title>
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Input
              accessibilityLabel="Search conversations"
              placeholder="Search Messenger"
              value={query}
              onChangeText={setQuery}
            />
          </View>
          {sources
            .filter((source) => source.rows.length > 0)
            .map((source) => (
              <View key={source.id}>
                <Label style={{ fontSize: 17, fontWeight: '700', padding: 16 }}>
                  {source.label}
                </Label>
                {source.rows.map((row) => (
                  <ExternalRowItem key={row.id} row={row} />
                ))}
              </View>
            ))}
          {contactIds
            .filter((personId) =>
              demo.person(personId).name.toLowerCase().includes(query.toLowerCase().trim()),
            )
            .map((personId) => {
              const person = demo.person(personId);
              const conversationId = demo.conversationFor(personId);
              const last = demo.messages(conversationId).at(-1);
              return (
                <Pressable
                  key={personId}
                  accessibilityRole="button"
                  accessibilityLabel={`Chat with ${person.name}`}
                  onPress={() => go(`/messages/${conversationId}`)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                    gap: 12,
                  }}
                >
                  <Avatar image={person.avatar} online={person.online} size={54} />
                  <View style={{ flex: 1 }}>
                    <Label style={{ fontWeight: '700', fontSize: 16 }}>{person.name}</Label>
                    <Muted numberOfLines={1}>
                      {last
                        ? `${last.authorId === demo.seed.viewerId ? 'You: ' : ''}${last.text}`
                        : 'Start a local conversation'}
                    </Muted>
                  </View>
                  {last && <Muted>{last.time}</Muted>}
                </Pressable>
              );
            })}
          <Muted style={{ padding: 16 }}>
            Messages remain on this device. No messages are sent to real people.
          </Muted>
        </Card>
      </Page>
    );
  const personId = contactIds.find((contact) => demo.conversationFor(contact) === id);
  if (!personId)
    return (
      <Empty title="Conversation not found" message="Choose a seeded contact from Messenger." />
    );
  const person = demo.person(personId);
  const messages = demo.messages(id);
  const send = () => {
    if (!text.trim()) return;
    demo.actions.sendMessage(id, text);
    setText('');
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
      style={{ flex: 1, backgroundColor: c.card }}
    >
      <Pressable
        onPress={() => go(`/profile/${person.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}'s profile`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 12,
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.divider,
        }}
      >
        <Avatar image={person.avatar} online={person.online} />
        <View>
          <Label style={{ fontWeight: '700' }}>{person.name}</Label>
          <Muted>{person.online ? 'Active in this demo' : 'Local demo conversation'}</Muted>
        </View>
      </Pressable>
      {listing && (
        <View style={{ backgroundColor: c.input, padding: 12 }}>
          <Label style={{ fontSize: 13, fontWeight: '600' }}>
            {listing.title} · ${listing.price}
          </Label>
        </View>
      )}
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1 }}
      >
        <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
          <Avatar image={person.avatar} size={72} />
          <Label style={{ fontSize: 20, fontWeight: '700' }}>{person.name}</Label>
          <Muted>This is a local demo conversation</Muted>
        </View>
        {messages.map((message) => {
          const own = message.authorId === demo.seed.viewerId;
          return (
            <View key={message.id} style={{ alignItems: own ? 'flex-end' : 'flex-start' }}>
              <View
                style={{
                  maxWidth: '85%',
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: own ? c.blue : c.input,
                }}
              >
                <Label style={{ color: own ? '#fff' : c.text }}>{message.text}</Label>
              </View>
              <Muted style={{ marginTop: 3, marginHorizontal: 8, fontSize: 10 }}>
                {message.time}
              </Muted>
            </View>
          );
        })}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          alignItems: 'flex-end',
          padding: 10,
          borderTopWidth: 1,
          borderTopColor: c.divider,
        }}
      >
        <Input
          multiline
          maxLength={2000}
          accessibilityLabel="Message"
          value={text}
          onChangeText={setText}
          placeholder="Aa"
          style={{ flex: 1, maxHeight: 120 }}
        />
        <IconButton
          name="send"
          label="Send message"
          color={text.trim() ? c.blue : c.secondary}
          onPress={send}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
