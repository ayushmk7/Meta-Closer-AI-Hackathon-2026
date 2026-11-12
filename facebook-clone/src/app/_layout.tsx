import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoProvider, useDemo } from '../core/store';
import { themes } from '../ui/tokens';
import Shell from '../ui/Shell';
function NativeRoutes() {
  const { state } = useDemo();
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  return (
    <Shell>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: themes[state.settings.theme].canvas },
          animation: reduceMotion ? 'none' : 'slide_from_right',
        }}
      />
    </Shell>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <DemoProvider>
        <NativeRoutes />
      </DemoProvider>
    </SafeAreaProvider>
  );
}
