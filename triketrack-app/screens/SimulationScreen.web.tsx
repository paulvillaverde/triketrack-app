import { Pressable, StyleSheet, Text, View } from 'react-native';

type SimulationScreenProps = {
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  onBack: () => void;
};

export function SimulationScreen({
  profileName,
  profileDriverCode,
  profilePlateNumber,
  onBack,
}: SimulationScreenProps) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.title}>Simulation</Text>
        <Text style={styles.subtitle}>
          Live map simulation is available on Android/iOS only.
        </Text>

        <View style={styles.infoBlock}>
          <Text style={styles.label}>Driver</Text>
          <Text style={styles.value}>{profileName}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Driver code</Text>
          <Text style={styles.value}>{profileDriverCode}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Plate number</Text>
          <Text style={styles.value}>{profilePlateNumber}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 24,
  },
  infoBlock: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
});
