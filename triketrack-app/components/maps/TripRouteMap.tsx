import { useEffect, useRef } from 'react';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';

type LatLng = { latitude: number; longitude: number };

type TripRouteMapProps = {
  routePath: LatLng[];
  geofence: LatLng[];
  style: any;
  getRouteRegion: (routePath: LatLng[]) => {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
};

export function TripRouteMap({ routePath, geofence, style, getRouteRegion }: TripRouteMapProps) {
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    if (!mapRef.current || routePath.length < 2) {
      return;
    }
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(routePath, {
        edgePadding: { top: 30, right: 30, bottom: 30, left: 30 },
        animated: false,
      });
    }, 30);
    return () => clearTimeout(timer);
  }, [routePath]);

  return (
    <MapView
      ref={(ref) => {
        mapRef.current = ref;
      }}
      style={style}
      pointerEvents="none"
      initialRegion={getRouteRegion(routePath)}
      mapType="standard"
      rotateEnabled={false}
      scrollEnabled
      zoomEnabled
      pitchEnabled={false}
      onMapReady={() => {
        if (!mapRef.current) {
          return;
        }
        if (routePath.length > 1) {
          mapRef.current.fitToCoordinates([...geofence, ...routePath], {
            // Slightly zoomed out so route and geofence are both visible on open.
            edgePadding: { top: 92, right: 36, bottom: 340, left: 36 },
            animated: false,
          });
          return;
        }
        if (routePath.length === 1) {
          mapRef.current.animateCamera(
            {
              center: routePath[0],
              zoom: 18,
              pitch: 45,
              heading: 0,
            },
            { duration: 600 },
          );
        }
      }}
    >
      {routePath.length > 1 ? (
        <Polyline
          coordinates={routePath}
          strokeColor="#2D7DF6"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}
      {routePath.length > 0 ? (
        <Marker coordinate={routePath[0]} title="Start" pinColor="#10B981" />
      ) : null}
      {routePath.length > 1 ? (
        <Marker coordinate={routePath[routePath.length - 1]} title="End" pinColor="#3B82F6" />
      ) : null}
      <Polygon
        coordinates={geofence}
        strokeColor="#5A67D8"
        fillColor="rgba(90,103,216,0.05)"
        strokeWidth={2}
      />
    </MapView>
  );
}
