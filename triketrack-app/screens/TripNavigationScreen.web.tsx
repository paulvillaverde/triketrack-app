import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HomeScreen } from './HomeScreen';

type TripNavigationScreenProps = Omit<ComponentProps<typeof HomeScreen>, 'isTripScreen'> & {
  forceNewTripSession?: boolean;
  initialTripLocation?: {
    latitude: number;
    longitude: number;
    timestampMs?: number | null;
  } | null;
};

export function TripNavigationScreen({ onExitTripNavigation }: TripNavigationScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Trip Navigation</Text>
        <Text style={styles.subtitle}>
          Live trip navigation is available on Android and iOS where the map and GPS tracking stack are supported.
        </Text>
        <Pressable style={styles.button} onPress={onExitTripNavigation}>
          <Text style={styles.buttonText}>Back to Trip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    color: '#0F172A',
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
  },
  button: {
    marginTop: 24,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

