import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import { smoothDisplayedRoutePath } from '../../lib/roadPath';

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
  const displayRoutePath = useMemo(() => smoothDisplayedRoutePath(routePath), [routePath]);

  useEffect(() => {
    if (!mapRef.current || displayRoutePath.length < 2) {
      return;
    }
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(displayRoutePath, {
        edgePadding: { top: 30, right: 30, bottom: 30, left: 30 },
        animated: false,
      });
    }, 30);
    return () => clearTimeout(timer);
  }, [displayRoutePath]);

  return (
    <MapView
      ref={(ref) => {
        mapRef.current = ref;
      }}
      style={style}
      pointerEvents="none"
      initialRegion={getRouteRegion(displayRoutePath)}
      mapType="standard"
      rotateEnabled={false}
      scrollEnabled
      zoomEnabled
      pitchEnabled={false}
      onMapReady={() => {
        if (!mapRef.current) {
          return;
        }
        if (displayRoutePath.length > 1) {
          mapRef.current.fitToCoordinates([...geofence, ...displayRoutePath], {
            // Slightly zoomed out so route and geofence are both visible on open.
            edgePadding: { top: 92, right: 36, bottom: 340, left: 36 },
            animated: false,
          });
          return;
        }
        if (displayRoutePath.length === 1) {
          mapRef.current.animateCamera(
            {
              center: displayRoutePath[0],
              zoom: 18,
              pitch: 45,
              heading: 0,
            },
            { duration: 600 },
          );
        }
      }}
    >
      {displayRoutePath.length > 1 ? (
        <Polyline
          coordinates={displayRoutePath}
          strokeColor="#2D7DF6"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}
      {displayRoutePath.length > 0 ? (
        <Marker coordinate={displayRoutePath[0]} title="Start" pinColor="#10B981" />
      ) : null}
      {displayRoutePath.length > 1 ? (
        <Marker coordinate={displayRoutePath[displayRoutePath.length - 1]} title="End" pinColor="#3B82F6" />
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
