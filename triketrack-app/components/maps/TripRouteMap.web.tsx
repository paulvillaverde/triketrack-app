import { StyleSheet, Text, View } from 'react-native';

type LatLng = { latitude: number; longitude: number };

type TripRouteMapProps = {
  routePath: LatLng[];
  rawStartPoint?: LatLng | null;
  dashedStartConnector?: LatLng[];
  endPoint?: LatLng | null;
  geofence: LatLng[];
  lockSavedRoute?: boolean;
  isLowBatteryMapMode?: boolean;
  style: any;
  getRouteRegion: (routePath: LatLng[]) => {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
};

export function TripRouteMap({ routePath, geofence, style }: TripRouteMapProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Web Preview</Text>
      </View>
      <Text style={styles.title}>Trip map is available on mobile</Text>
      <Text style={styles.meta}>Route points: {routePath.length}</Text>
      <Text style={styles.meta}>Geofence points: {geofence.length}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EAF1F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D7E1EA',
  },
  badge: {
    backgroundColor: '#57c7a8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'CircularStdMedium500',
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 6,
  },
  meta: {
    fontSize: 12,
    lineHeight: 15,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
});
