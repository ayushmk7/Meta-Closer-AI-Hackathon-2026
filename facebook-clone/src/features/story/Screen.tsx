import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageSource } from '../../data/media';
import { Avatar, Empty, IconButton } from '../../ui/native';
export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const demo = useDemo();
  const index = demo.stories.findIndex((story) => story.id === id);
  const story = demo.stories[index];
  if (!story)
    return <Empty title="Story not found" message="Return Home to view the demo stories." />;
  const person = demo.person(story.authorId);
  const move = (offset: number) => {
    const target = demo.stories[index + offset];
    if (target) router.replace(`/stories/${target.id}` as Href);
    else if (offset > 0) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#17191b' }}>
      <Image
        source={imageSource(story.image)}
        accessibilityLabel={story.text ?? `${person.name}'s story`}
        resizeMode="contain"
        style={{ width: '100%', height: '100%', position: 'absolute' }}
      />
      <View style={{ padding: 12, gap: 12, backgroundColor: '#00000055' }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {demo.stories.map((item, i) => (
            <View
              key={item.id}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 3,
                backgroundColor: i <= index ? '#fff' : '#ffffff55',
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Avatar image={person.avatar} size={36} />
          <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>{person.name}</Text>
          <IconButton
            name="close"
            label="Close story"
            color="#fff"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
      </View>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous story"
          disabled={index === 0}
          onPress={() => move(-1)}
          style={{ flex: 1 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next story"
          onPress={() => move(1)}
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ padding: 20, backgroundColor: '#00000055', gap: 10 }}>
        {story.text && (
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '600', textAlign: 'center' }}>
            {story.text}
          </Text>
        )}
        <Text style={{ color: '#ddd', fontSize: 12, textAlign: 'center' }}>
          Tap the left or right side to browse stories
        </Text>
      </View>
    </View>
  );
}
