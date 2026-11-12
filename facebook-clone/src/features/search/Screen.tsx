import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageSource } from '../../data/media';
import { Card, Empty, go, Icon, Input, Label, Muted, Page, useColors } from '../../ui/native';
export default function SearchScreen() {
  const demo = useDemo();
  const c = useColors();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q ?? '');
  const results = demo.search(query);
  const kinds = [...new Set(results.map((result) => result.kind))];
  return (
    <Page>
      <Card style={{ borderRadius: 0, padding: 14 }}>
        <Input
          autoFocus
          accessibilityLabel="Search all demo content"
          placeholder="Search Facebook"
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <Muted style={{ marginTop: 8 }}>People, posts, stories, Marketplace and events</Muted>
      </Card>
      {!query.trim() ? (
        <Card>
          <View style={{ padding: 16 }}>
            <Label style={{ fontSize: 20, fontWeight: '700' }}>People you know</Label>
          </View>
          {demo.friends.slice(0, 5).map((person) => (
            <Pressable
              key={person.id}
              onPress={() => go(`/profile/${person.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${person.name}'s profile`}
              style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Image
                source={imageSource(person.avatar)}
                style={{ width: 44, height: 44, borderRadius: 22 }}
              />
              <Label>{person.name}</Label>
            </Pressable>
          ))}
        </Card>
      ) : !results.length ? (
        <Card>
          <Empty title="No results found" message={`Try another name or keyword for “${query}”.`} />
        </Card>
      ) : (
        kinds.map((kind) => (
          <Card key={kind}>
            <View style={{ padding: 16 }}>
              <Label accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700' }}>
                {kind}
              </Label>
            </View>
            {results
              .filter((result) => result.kind === kind)
              .map((result) => (
                <Pressable
                  key={`${result.kind}-${result.id}`}
                  onPress={() => go(result.href)}
                  accessibilityRole="button"
                  accessibilityLabel={`${result.kind}: ${result.title}`}
                  style={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}
                >
                  {result.image ? (
                    <Image
                      source={imageSource(result.image)}
                      style={{ width: 52, height: 52, borderRadius: kind === 'People' ? 26 : 7 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 7,
                        backgroundColor: c.input,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="document-text-outline" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Label numberOfLines={2} style={{ fontWeight: '600' }}>
                      {result.title}
                    </Label>
                    <Muted numberOfLines={2}>{result.subtitle}</Muted>
                  </View>
                  <Icon name="chevron-forward" size={18} color={c.secondary} />
                </Pressable>
              ))}
          </Card>
        ))
      )}
    </Page>
  );
}
