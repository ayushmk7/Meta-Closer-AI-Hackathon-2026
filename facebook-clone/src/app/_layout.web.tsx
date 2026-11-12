import { Slot } from 'expo-router';
import { DemoProvider } from '../core/store';
import Shell from '../ui/Shell';
export default function Layout() {
  return (
    <DemoProvider>
      <Shell>
        <Slot />
      </Shell>
    </DemoProvider>
  );
}
