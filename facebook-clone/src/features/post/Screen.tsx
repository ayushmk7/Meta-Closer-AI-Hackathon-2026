import React from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { Empty, Page, useKeyboardOffset } from '../../ui/native';
import { PostCard } from '../feed';
export default function PostScreen() {
  const keyboardOffset = useKeyboardOffset();
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = useDemo().posts.find((item) => item.id === id);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
      style={{ flex: 1 }}
    >
      <Page>
        {post ? (
          <PostCard post={post} expanded />
        ) : (
          <Empty
            title="Post not found"
            message="This post may have been removed when the demo was reset."
          />
        )}
      </Page>
    </KeyboardAvoidingView>
  );
}
