/* eslint-disable @typescript-eslint/no-require-imports -- Metro requires static asset paths. */
import { Asset } from 'expo-asset';
import { isPhotoAvailable } from '../platform/photo';
import type { ImageSourcePropType } from 'react-native';
import { mediaKeys } from './mediaKeys';

const assets: Record<(typeof mediaKeys)[number], number> = {
  'facebook-logo': require('../../assets/brand/facebook-logo.png'),
  maya: require('../../assets/images/maya.jpg'),
  amina: require('../../assets/images/amina.jpg'),
  leo: require('../../assets/images/leo.jpg'),
  priya: require('../../assets/images/priya.jpg'),
  jordan: require('../../assets/images/jordan.jpg'),
  elena: require('../../assets/images/elena.jpg'),
  theo: require('../../assets/images/theo.jpg'),
  sofia: require('../../assets/images/sofia.jpg'),
  sam: require('../../assets/images/sam.jpg'),
  nora: require('../../assets/images/nora.jpg'),
  kai: require('../../assets/images/kai.jpg'),
  lucas: require('../../assets/images/lucas.jpg'),
  ava: require('../../assets/images/ava.jpg'),
  'garden-harvest': require('../../assets/images/garden-harvest.jpg'),
  'coast-1': require('../../assets/images/coast-1.jpg'),
  'coast-2': require('../../assets/images/coast-2.jpg'),
  'coast-3': require('../../assets/images/coast-3.jpg'),
  'book-swap': require('../../assets/images/book-swap.jpg'),
  pottery: require('../../assets/images/pottery.jpg'),
  'park-dog': require('../../assets/images/park-dog.jpg'),
  cover: require('../../assets/images/cover.jpg'),
  lamp: require('../../assets/images/lamp.jpg'),
  bike: require('../../assets/images/bike.jpg'),
  bookcase: require('../../assets/images/bookcase.jpg'),
  camera: require('../../assets/images/camera.jpg'),
  plant: require('../../assets/images/plant.jpg'),
  table: require('../../assets/images/table.jpg'),
  'market-morning': require('../../assets/images/market-morning.jpg'),
  'weekend-breakfast': require('../../assets/images/weekend-breakfast.jpg'),
  'city-street': require('../../assets/images/city-street.jpg'),
  'city-bridge': require('../../assets/images/city-bridge.jpg'),
  cafe: require('../../assets/images/cafe.jpg'),
  pizza: require('../../assets/images/pizza.jpg'),
  coffee: require('../../assets/images/coffee.jpg'),
  'garden-plants': require('../../assets/images/garden-plants.jpg'),
  salad: require('../../assets/images/salad.jpg'),
  workspace: require('../../assets/images/workspace.jpg'),
  paintbrushes: require('../../assets/images/paintbrushes.jpg'),
  bread: require('../../assets/images/bread.jpg'),
  headphones: require('../../assets/images/headphones.jpg'),
  'kitchen-stool': require('../../assets/images/kitchen-stool.jpg'),
  speaker: require('../../assets/images/speaker.jpg'),
  guitar: require('../../assets/images/guitar.jpg'),
  backpack: require('../../assets/images/backpack.jpg'),
  clock: require('../../assets/images/clock.jpg'),
  rug: require('../../assets/images/rug.jpg'),
  sneakers: require('../../assets/images/sneakers.jpg'),
  keyboard: require('../../assets/images/keyboard.jpg'),
  armchair: require('../../assets/images/armchair.jpg'),
};

export function imageSource(ref: string): ImageSourcePropType {
  if (!isPhotoAvailable(ref)) return require('../../assets/images/photo-unavailable.png');
  if (/^(data:image\/(jpeg|png|webp);base64,|file:\/\/)/.test(ref)) return { uri: ref };
  return assets[ref as keyof typeof assets] ?? assets.maya;
}

export function imageUri(ref: string): string {
  const source = imageSource(ref);
  return typeof source === 'number'
    ? Asset.fromModule(source).uri
    : (source as { uri: string }).uri;
}
