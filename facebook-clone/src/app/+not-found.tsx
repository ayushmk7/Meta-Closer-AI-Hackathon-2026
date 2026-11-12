import { Link } from 'expo-router';
import { Text, View } from 'react-native';
export default function NotFound() {
  return (
    <View style={{ padding: 32 }}>
      <Text>This page isn't available in the demo.</Text>
      <Link href="/">Back to Home</Link>
    </View>
  );
}
