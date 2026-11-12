import React, { useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useDemo } from '../../core/store';
import { Button, Label, Muted, useKeyboardOffset } from '../../ui/native';
import { homeSections } from '../../extensions/registry';
import { Composer, PostCard, Stories } from './Components';
export default function FeedScreen() {
  const demo = useDemo();
  const keyboardOffset = useKeyboardOffset();
  const scroll = useRef<ScrollView>(null);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
      style={{ flex: 1 }}
    >
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24, gap: 8 }}
      >
        <Composer />
        <Stories />
        {homeSections.map(({ id, Component }) => (
          <Component key={id} />
        ))}
        {demo.posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        <View style={{ padding: 24, alignItems: 'center', gap: 10 }}>
          <Label style={{ fontSize: 18, fontWeight: '700' }}>You&apos;re all caught up</Label>
          <Muted style={{ textAlign: 'center' }}>You&apos;ve seen every post in this demo.</Muted>
          <Button
            title="Back to top"
            secondary
            icon="arrow-up"
            onPress={() => scroll.current?.scrollTo({ y: 0, animated: false })}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
