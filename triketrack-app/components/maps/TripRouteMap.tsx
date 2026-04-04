import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import { smoothDisplayedRoutePath } from '../../lib/roadPath';
import { AppleMapPinMarker } from './AppleMapPinMarker';

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
  const routeFitPadding = useMemo(
    () => ({ top: 88, right: 32, bottom: 320, left: 32 }),
    [],
  );

  useEffect(() => {
    if (!mapRef.current || displayRoutePath.length < 2) {
      return;
    }
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(displayRoutePath, {
        edgePadding: routeFitPadding,
        animated: false,
      });
    }, 30);
    return () => clearTimeout(timer);
  }, [displayRoutePath, routeFitPadding]);

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
          mapRef.current.fitToCoordinates(displayRoutePath, {
            edgePadding: routeFitPadding,
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
        <>
          <Polyline
            coordinates={displayRoutePath}
            strokeColor="rgba(255,255,255,0.92)"
            strokeWidth={8}
            lineCap="round"
            lineJoin="round"
            zIndex={3}
          />
          <Polyline
            coordinates={displayRoutePath}
            strokeColor="#2D7DF6"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            zIndex={4}
          />
        </>
      ) : null}
      {displayRoutePath.length > 0 ? (
        <Marker
          coordinate={displayRoutePath[0]}
          title="Start"
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges
        >
          <AppleMapPinMarker color="#22C55E" iconName="navigation" size="sm" />
        </Marker>
      ) : null}
      {displayRoutePath.length > 1 ? (
        <Marker
          coordinate={displayRoutePath[displayRoutePath.length - 1]}
          title="End"
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges
        >
          <AppleMapPinMarker color="#3B82F6" iconName="check-circle" size="sm" />
        </Marker>
      ) : null}
      <Polygon
        coordinates={geofence}
        strokeColor="#5A67D8"
        fillColor="rgba(90,103,216,0.05)"
        strokeWidth={2}
        zIndex={1}
      />
    </MapView>
  );
}
