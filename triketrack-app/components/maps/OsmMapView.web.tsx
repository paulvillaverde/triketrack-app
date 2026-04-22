import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';

export type OsmCoordinate = {
  latitude: number;
  longitude: number;
};

export type OsmRegion = OsmCoordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export type OsmMapPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type OsmCamera = {
  center?: OsmCoordinate;
  zoom?: number;
  pitch?: number;
  heading?: number;
};

export type OsmMarkerSpec = {
  id: string;
  coordinate: OsmCoordinate;
  kind?: 'avatar' | 'navigation' | 'pin' | 'dot';
  color?: string;
  fillColor?: string;
  borderColor?: string;
  size?: number;
  label?: string;
  initials?: string;
  rotationDeg?: number;
};

export type OsmPolylineSpec = {
  id: string;
  coordinates: OsmCoordinate[];
  strokeColor: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
};

export type OsmPolygonSpec = {
  id: string;
  coordinates: OsmCoordinate[];
  strokeColor: string;
  fillColor: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
};

export type OsmCircleSpec = {
  id: string;
  center: OsmCoordinate;
  radius: number;
  strokeColor: string;
  fillColor: string;
  strokeWidth?: number;
};

export type OsmMapViewHandle = {
  animateCamera: (_camera: OsmCamera, _options?: { duration?: number }) => void;
  fitToCoordinates: (
    _coordinates: OsmCoordinate[],
    _options?: {
      edgePadding?: Partial<OsmMapPadding>;
      animated?: boolean;
    },
  ) => void;
  getCamera: () => Promise<{ center: OsmCoordinate | null; zoom: number }>;
};

type OsmMapViewProps = {
  style?: any;
  initialRegion: OsmRegion;
  mapStyleUrl?: string;
  tileUrlTemplate?: string;
  tileFilterCss?: string;
  backgroundColor?: string;
  markers?: OsmMarkerSpec[];
  polylines?: OsmPolylineSpec[];
  polygons?: OsmPolygonSpec[];
  circles?: OsmCircleSpec[];
  mapPadding?: Partial<OsmMapPadding>;
  pointerEvents?: ViewProps['pointerEvents'];
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  onMapReady?: () => void;
};

export const OsmMapView = forwardRef<OsmMapViewHandle, OsmMapViewProps>(function OsmMapView(
  { style, markers = [], polylines = [], polygons = [], circles = [] },
  ref,
) {
  useImperativeHandle(
    ref,
    () => ({
      animateCamera() {},
      fitToCoordinates() {},
      async getCamera() {
        return { center: null, zoom: 15 };
      },
    }),
    [],
  );

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>OSM map preview is available on mobile</Text>
      <Text style={styles.meta}>Markers: {markers.length}</Text>
      <Text style={styles.meta}>Polylines: {polylines.length}</Text>
      <Text style={styles.meta}>Polygons: {polygons.length}</Text>
      <Text style={styles.meta}>Circles: {circles.length}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#D7E1EA',
    backgroundColor: '#EAF1F7',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  meta: {
    fontSize: 12,
    lineHeight: 15,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
});
