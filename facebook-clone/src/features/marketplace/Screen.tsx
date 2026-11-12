import React, { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageSource } from '../../data/media';
import {
  Avatar,
  Button,
  Card,
  Chips,
  Empty,
  go,
  Icon,
  IconButton,
  Input,
  Label,
  Muted,
  Page,
  Sheet,
  Title,
  useColors,
} from '../../ui/native';
export default function MarketplaceScreen() {
  const demo = useDemo();
  const c = useColors();
  const params = useLocalSearchParams<{ id?: string }>();
  const [mode, setMode] = useState('For you');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [maxPrice, setMaxPrice] = useState('Any price');
  const [filters, setFilters] = useState(false);
  const categories = [
    'All categories',
    ...new Set(demo.seed.listings.map((listing) => listing.category)),
  ];
  const listing = demo.seed.listings.find((item) => item.id === params.id);
  if (params.id) {
    if (!listing)
      return (
        <Empty
          title="Listing not found"
          message="Browse the six locally seeded listings in Marketplace."
        />
      );
    const seller = demo.person(listing.sellerId);
    const saved = demo.state.savedListingIds.includes(listing.id);
    return (
      <Page>
        <Card style={{ borderRadius: 0 }}>
          <Image
            source={imageSource(listing.image)}
            accessibilityLabel={listing.title}
            style={{ width: '100%', aspectRatio: 1 }}
          />
          <View style={{ padding: 16, gap: 12 }}>
            <Label
              accessibilityRole="header"
              style={{ fontSize: 25, lineHeight: 31, fontWeight: '700' }}
            >
              {listing.title}
            </Label>
            <Label style={{ fontSize: 23, lineHeight: 28, fontWeight: '700' }}>
              ${listing.price}
            </Label>
            <Muted>Listed in {listing.location}</Muted>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title="Message seller"
                icon="chatbubble"
                onPress={() =>
                  go(`/messages/${demo.conversationFor(seller.id)}?listing=${listing.id}`)
                }
                style={{ flex: 1 }}
              />
              <Button
                title={saved ? 'Saved' : 'Save'}
                icon={saved ? 'bookmark' : 'bookmark-outline'}
                onPress={() => demo.actions.toggleSavedListing(listing.id)}
                secondary
              />
            </View>
            <Label style={{ fontWeight: '700', fontSize: 20, marginTop: 8 }}>Details</Label>
            <Label>Condition: {listing.condition}</Label>
            <Label>Category: {listing.category}</Label>
            <Label style={{ lineHeight: 23 }}>{listing.description}</Label>
            <Label style={{ fontWeight: '700', fontSize: 20, marginTop: 12 }}>
              Seller information
            </Label>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${seller.name}'s profile`}
              onPress={() => go(`/profile/${seller.id}`)}
              style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
            >
              <Avatar image={seller.avatar} size={48} />
              <View>
                <Label style={{ fontWeight: '700' }}>{seller.name}</Label>
                <Muted>{seller.location}</Muted>
              </View>
            </Pressable>
            <Muted>This listing and its seller conversation are part of the local demo.</Muted>
          </View>
        </Card>
      </Page>
    );
  }
  const selectedPrice =
    maxPrice === 'Any price' ? Infinity : Number(maxPrice.replace('Under $', ''));
  const listings = demo.seed.listings.filter(
    (item) =>
      (mode !== 'Saved' || demo.state.savedListingIds.includes(item.id)) &&
      (mode !== 'Local' || item.location === demo.seed.listings[0]?.location) &&
      (category === 'All categories' || item.category === category) &&
      item.price <= selectedPrice &&
      `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase().trim()),
  );
  return (
    <>
      <Page style={{ gap: 0 }}>
        <Card style={{ borderRadius: 0 }}>
          <Title
            aside={
              <IconButton
                name="options-outline"
                label="Marketplace filters"
                onPress={() => setFilters(true)}
              />
            }
          >
            Marketplace
          </Title>
          <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
            <Input
              placeholder="Search Marketplace"
              accessibilityLabel="Search Marketplace"
              value={query}
              onChangeText={setQuery}
              clearButtonMode="while-editing"
            />
          </View>
          <Chips items={['For you', 'Local', 'Saved']} value={mode} onChange={setMode} />
          <View
            style={{
              paddingHorizontal: 14,
              paddingBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Label style={{ fontWeight: '700', fontSize: 18, flex: 1 }}>
              {mode === 'Saved' ? 'Saved listings' : "Today's picks"}
            </Label>
            <Icon name="location" size={16} color={c.blue} />
            <Muted style={{ color: c.blue }}>{demo.seed.listings[0]?.location}</Muted>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 4 }}>
            {listings.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, $${item.price}`}
                onPress={() => go(`/marketplace/${item.id}`)}
                style={{ width: '49.4%', paddingBottom: 16 }}
              >
                <Image
                  source={imageSource(item.image)}
                  accessibilityLabel={item.title}
                  style={{ width: '100%', aspectRatio: 1, borderRadius: 5 }}
                />
                <View style={{ paddingHorizontal: 5, paddingTop: 7, gap: 2 }}>
                  <Label numberOfLines={2} style={{ fontSize: 14, lineHeight: 20 }}>
                    <Label style={{ fontWeight: '700', fontSize: 14 }}>${item.price}</Label> ·{' '}
                    {item.title}
                  </Label>
                  <Muted numberOfLines={1} style={{ fontSize: 11 }}>
                    {item.location}
                  </Muted>
                </View>
              </Pressable>
            ))}
          </View>
          {!listings.length && (
            <Empty title="No listings found" message="Try another search or clear your filters." />
          )}
        </Card>
      </Page>
      <Sheet visible={filters} title="Marketplace filters" onClose={() => setFilters(false)}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Label style={{ fontWeight: '700', fontSize: 18 }}>Category</Label>
          {categories.map((item) => (
            <Button
              key={item}
              title={`${category === item ? '✓ ' : ''}${item}`}
              secondary={category !== item}
              onPress={() => setCategory(item)}
            />
          ))}
          <Label style={{ fontWeight: '700', fontSize: 18 }}>Price</Label>
          {['Any price', 'Under $50', 'Under $100', 'Under $300'].map((price) => (
            <Button
              key={price}
              title={`${maxPrice === price ? '✓ ' : ''}${price}`}
              secondary={maxPrice !== price}
              onPress={() => setMaxPrice(price)}
            />
          ))}
          <Button title="Show listings" onPress={() => setFilters(false)} />
          <Button
            title="Clear filters"
            secondary
            onPress={() => {
              setCategory('All categories');
              setMaxPrice('Any price');
              setQuery('');
              setMode('For you');
              setFilters(false);
            }}
          />
        </ScrollView>
      </Sheet>
    </>
  );
}
