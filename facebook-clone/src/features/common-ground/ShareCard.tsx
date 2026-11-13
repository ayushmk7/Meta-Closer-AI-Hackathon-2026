// An anonymous share, drawn like a Facebook post. Shares carry no person fields by contract:
// the "author" line is the venue, and the photo is the venue's, never a user's.
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Divider, Icon, Label, Muted, go, useColors } from '../../ui/native';
import { activityIcon as planIcon, photoSource } from './PlanCard';
import { shareOut, welcomeLink } from './share';
import { likeShare, planLikeThis, useCg } from './store';
import type { Share } from './types';
import { PopOn, selectedBg } from './ui';

// Gallery activity types PlanCard's map doesn't cover; anything else falls back to it.
const ICONS: Record<string, React.ComponentProps<typeof Icon>['name']> = {
  ceramics_studio: 'color-palette',
  climbing_session: 'trending-up',
  bouldering: 'trending-up',
};
const activityIcon = (type: string) => ICONS[type] ?? planIcon(type);

// "ceramics_studio" -> "Ceramics studio"
export const activityLabel = (type: string): string => {
  const s = type.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
// happenedOn is an LA calendar date; format it as a date, not an instant (no TZ shift).
export const shareDate = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

// "Plan something like this": a new plan opens its pop-up; a Muse answer shows on Plans home.
// ponytail: one module-wide in-flight flag (ShareCard and IdeasRow share it); a second tap
// while Muse is working is dropped instead of creating a second plan.
let planning = false;
export async function planFromShare(share: Share): Promise<void> {
  if (planning) return;
  planning = true;
  try {
    const r = await planLikeThis(share);
    if (r) go('planId' in r ? `/common-ground/plan/${r.planId}` : '/common-ground');
  } finally {
    planning = false;
  }
}

function Action({
  icon,
  label,
  active,
  a11y,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  active?: boolean;
  a11y: string;
  onPress(): void;
}) {
  const c = useColors();
  const color = active ? c.blue : c.secondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 8,
        backgroundColor: pressed ? c.input : 'transparent',
      })}
    >
      {/* Pops when turned on (Like), not for posts already liked on load. */}
      <PopOn on={!!active} quiet>
        <Icon name={icon} size={19} color={color} />
      </PopOn>
      <Label style={{ color, fontWeight: '600', fontSize: 13, lineHeight: 18 }}>{label}</Label>
    </Pressable>
  );
}

// "<caption>\n<Activity> at <venue>, <neighborhood>\n<welcome link>": no person fields (C5).
export const shareMessage = (s: Share): string =>
  [
    s.caption,
    `${activityLabel(s.activityType)} at ${s.venue.name}, ${s.venue.neighborhood}`,
    welcomeLink(s.shareId),
  ]
    .filter(Boolean)
    .join('\n');

export function SharePhoto({ share, height }: { share: Share; height: number }) {
  const c = useColors();
  return (
    <View
      style={{
        height,
        backgroundColor: selectedBg(c),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={activityIcon(share.activityType)} size={40} color={c.blue} />
      {share.photoUrl && (
        <Image
          source={photoSource(share.photoUrl)}
          cachePolicy="memory"
          accessibilityIgnoresInvertColors
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
    </View>
  );
}

export default function ShareCard({
  share,
  readOnly = false,
}: {
  share: Share;
  readOnly?: boolean;
}) {
  const c = useColors();
  const sharing = useCg((s) => !!s.config?.features.sharing);
  const meta = [
    shareDate(share.happenedOn),
    share.venue.neighborhood,
    `${share.groupSize} people went`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={{ backgroundColor: c.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
        <View
          accessible
          accessibilityLabel={activityLabel(share.activityType)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.blue,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Icon name={activityIcon(share.activityType)} size={21} color="#fff" />
          {/* The venue photo is the page avatar, like a Facebook Page post; the icon is the fallback. */}
          {share.photoUrl && (
            <Image
              source={photoSource(share.photoUrl)}
              cachePolicy="memory"
              accessibilityIgnoresInvertColors
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Label style={{ fontWeight: '700' }} numberOfLines={1}>
            {share.venue.name}
          </Label>
          <Muted numberOfLines={1}>{share.mine ? `Your share · ${meta}` : meta}</Muted>
        </View>
      </View>
      {!!share.caption && (
        <Label style={{ paddingHorizontal: 12, paddingBottom: 10, fontSize: 15, lineHeight: 21 }}>
          {share.caption}
        </Label>
      )}
      {/* No photo: a text post, like Facebook, not a big empty placeholder. */}
      {share.photoUrl && <SharePhoto share={share} height={220} />}
      {/* Facebook hides the reactions row until there is one. */}
      {share.likes > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 4 }}>
          <Icon name="thumbs-up" size={15} color={c.blue} />
          <Muted style={{ flex: 1 }}>{share.likes}</Muted>
          <Muted>{activityLabel(share.activityType)}</Muted>
        </View>
      )}
      {/* Read-only (logged-out) cards get a Share-only row, and only when sharing is on. */}
      {(!readOnly || sharing) && (
        <>
          <View style={{ marginHorizontal: 12 }}>
            <Divider />
          </View>
          <View style={{ flexDirection: 'row', paddingHorizontal: 8, minHeight: 46 }}>
            {!readOnly && (
              <Action
                icon={share.likedByMe ? 'thumbs-up' : 'thumbs-up-outline'}
                label="Like"
                active={share.likedByMe}
                a11y={share.likedByMe ? `Unlike ${share.venue.name}` : `Like ${share.venue.name}`}
                onPress={() => void likeShare(share.shareId, !share.likedByMe)}
              />
            )}
            {!readOnly && (
              <Action
                icon="sparkles-outline"
                label="Plan this"
                a11y={`Plan something like this: ${share.promptText}`}
                onPress={() => void planFromShare(share)}
              />
            )}
            {sharing && (
              <Action
                icon="arrow-redo-outline"
                label="Share"
                a11y={`Share ${share.venue.name}`}
                onPress={() => void shareOut(shareMessage(share))}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}
