import React, { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useDemo } from '../core/store';
import { imageSource } from '../data/media';
import { themes } from './tokens';
import type { ExternalRow } from '../extensions/types';

export const go = (href: string) => router.push(href as Href);
export function useKeyboardOffset() {
  return useSafeAreaInsets().top + 52;
}
export function useColors() {
  return themes[useDemo().state.settings.theme];
}
export function Icon({
  name,
  size = 23,
  color,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  size?: number;
  color?: string;
}) {
  const colors = useColors();
  return <Ionicons name={name} size={size} color={color ?? colors.text} />;
}
export function Label({ style, ...props }: TextProps) {
  const c = useColors();
  return <Text {...props} style={[{ color: c.text, fontSize: 15, lineHeight: 21 }, style]} />;
}
export function Muted({ style, ...props }: TextProps) {
  const c = useColors();
  return <Label {...props} style={[{ color: c.secondary, fontSize: 13, lineHeight: 18 }, style]} />;
}
export function Avatar({
  image,
  size = 40,
  online = false,
  label,
}: {
  image: string;
  size?: number;
  online?: boolean;
  label?: string;
}) {
  const c = useColors();
  return (
    <View style={{ width: size, height: size }}>
      <Image
        accessibilityLabel={label}
        source={imageSource(image)}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.input }}
      />
      {online && (
        <View
          style={{
            position: 'absolute',
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: c.online,
            borderWidth: 2,
            borderColor: c.card,
            bottom: 0,
            right: 0,
          }}
        />
      )}
    </View>
  );
}
// ponytail: one row layout shared by Messenger inbox sources and Events event sources.
export function ExternalRowItem({ row }: { row: ExternalRow }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.title}
      onPress={() => go(row.href)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 13,
        gap: 12,
      }}
    >
      {row.imageUri ? (
        <Image
          source={{ uri: row.imageUri }}
          style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: c.input }}
        />
      ) : (
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: c.input,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Label style={{ fontWeight: '700', fontSize: 17 }}>{row.initials}</Label>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Label style={{ fontWeight: '700', fontSize: 16 }}>{row.title}</Label>
        <Muted numberOfLines={1}>{row.subtitle}</Muted>
      </View>
      {!!row.time && <Muted>{row.time}</Muted>}
      {row.unread && (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.blue }} />
      )}
    </Pressable>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress(): void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: 42,
          borderRadius: 7,
          paddingHorizontal: 13,
          paddingVertical: 9,
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'row',
          gap: 7,
          backgroundColor: secondary ? c.input : c.blue,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={19} color={secondary ? c.text : '#fff'} />}
      <Label style={{ fontWeight: '600', color: secondary ? c.text : '#fff', textAlign: 'center' }}>
        {title}
      </Label>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  color,
  badge,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress(): void;
  color?: string;
  badge?: number;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Icon name={name} color={color} />
      {!!badge && (
        <View
          style={{
            backgroundColor: c.badge,
            position: 'absolute',
            right: 2,
            top: 1,
            borderRadius: 9,
            paddingHorizontal: 5,
            minWidth: 17,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
            {badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: 8, overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}
export function Page({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[{ paddingBottom: 24, gap: 8 }, style]}
    >
      {children}
    </ScrollView>
  );
}
export function Title({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: 16,
      }}
    >
      <Label
        accessibilityRole="header"
        style={{ fontSize: 25, lineHeight: 31, fontWeight: '800', flex: 1 }}
      >
        {children}
      </Label>
      {aside}
    </View>
  );
}
export function Empty({ title, message }: { title: string; message: string }) {
  return (
    <View style={{ padding: 30, gap: 8, alignItems: 'center' }}>
      <Icon name="albums-outline" size={38} />
      <Label style={{ fontSize: 19, fontWeight: '700', textAlign: 'center' }}>{title}</Label>
      <Muted style={{ textAlign: 'center' }}>{message}</Muted>
    </View>
  );
}
export function Input(props: TextInputProps) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.secondary}
      {...props}
      style={[
        {
          color: c.text,
          fontSize: 15,
          minHeight: 44,
          backgroundColor: c.input,
          borderRadius: 22,
          paddingHorizontal: 16,
          paddingVertical: 10,
        },
        props.style,
      ]}
    />
  );
}
export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.divider }} />;
}
export function Chips({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange(value: string): void;
}) {
  const c = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
    >
      {items.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="button"
          accessibilityState={{ selected: item === value }}
          onPress={() => onChange(item)}
          style={{
            minHeight: 40,
            paddingHorizontal: 15,
            paddingVertical: 10,
            borderRadius: 22,
            backgroundColor:
              item === value ? (c.canvas === '#18191A' ? '#263951' : '#e7f3ff') : c.input,
          }}
        >
          <Label
            style={{ color: item === value ? c.blue : c.text, fontWeight: '600', fontSize: 14 }}
          >
            {item}
          </Label>
        </Pressable>
      ))}
    </ScrollView>
  );
}
const AnimatedSafeArea = Animated.createAnimatedComponent(SafeAreaView);
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  const c = useColors();
  // Facebook pattern: a centred dialog on wide screens, a full-width bottom sheet below 600px.
  const { width, height } = useWindowDimensions();
  const dialog = width >= 600;
  const slide = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    slide.setValue(1);
    // ponytail: slide-in only; the Modal unmounts on close, so a slide-out would need delayed-unmount state.
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) =>
      reduce
        ? slide.setValue(0)
        : Animated.timing(slide, {
            toValue: 0,
            duration: 250,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
          }).start(),
    );
  }, [visible, slide]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          justifyContent: dialog ? 'center' : 'flex-end',
          alignItems: 'center',
          padding: dialog ? 16 : 0,
          paddingTop: 60,
        }}
      >
        <Pressable
          accessible={false}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
        />
        <AnimatedSafeArea
          edges={dialog ? [] : ['bottom']}
          style={{
            transform: [{ translateY: Animated.multiply(slide, height) }],
            width: '100%',
            maxWidth: dialog ? 500 : undefined,
            maxHeight: '100%',
            backgroundColor: c.card,
            borderRadius: dialog ? 8 : 0,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 8,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: c.divider,
            }}
          >
            <IconButton name="close" label={`Close ${title}`} onPress={onClose} />
            <Label
              accessibilityRole="header"
              style={{
                fontWeight: '700',
                fontSize: 18,
                flex: 1,
                textAlign: 'center',
                paddingRight: 44,
              }}
            >
              {title}
            </Label>
          </View>
          {children}
        </AnimatedSafeArea>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Busy() {
  const c = useColors();
  return (
    <View
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.canvas }}
    >
      <ActivityIndicator size="large" color={c.blue} />
    </View>
  );
}
export function reportError(error: unknown) {
  Alert.alert(
    'Could not complete that action',
    error instanceof Error ? error.message : 'Please try again. Your draft has been kept.',
  );
}
