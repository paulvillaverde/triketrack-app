import {
  Camera,
  FillLayer,
  LineLayer,
  MapView,
  MarkerView,
  ShapeSource,
  type CameraRef,
  type MapViewRef,
} from '@maplibre/maplibre-react-native';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  NativeModules,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type ViewProps,
} from 'react-native';
import { Avatar } from '../ui';
import {
  OSM_LIGHT_BACKGROUND,
  OSM_VECTOR_DARK_STYLE,
  OSM_MAXIM_DARK_BACKGROUND,
  OSM_VECTOR_LIGHT_STYLE_URL,
} from './osmTheme';

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
  imageUri?: string | null;
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
  animateCamera: (camera: OsmCamera, options?: { duration?: number }) => void;
  fitToCoordinates: (
    coordinates: OsmCoordinate[],
    options?: {
      edgePadding?: Partial<OsmMapPadding>;
      animated?: boolean;
    },
  ) => void;
  getCamera: () => Promise<{ center: OsmCoordinate | null; zoom: number }>;
};

type OsmMapViewProps = {
  style?: any;
  initialRegion: OsmRegion;
  mapStyleUrl?: string | Record<string, unknown>;
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

type PendingCommand =
  | {
      type: 'animateCamera';
      camera: OsmCamera;
      duration: number;
    }
  | {
      type: 'fitToCoordinates';
      coordinates: OsmCoordinate[];
      padding: OsmMapPadding;
      animated: boolean;
    };

const DEFAULT_PADDING: OsmMapPadding = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const DEFAULT_ZOOM = 15;
const MAPLIBRE_AVAILABLE = Boolean(NativeModules.MLRNModule);

const clampZoom = (value: number) => Math.max(2, Math.min(19, value));

const regionToZoom = (region: OsmRegion) => {
  const safeLongitudeDelta = Math.max(region.longitudeDelta, 0.0002);
  return clampZoom(Math.round(Math.log2(360 / safeLongitudeDelta)));
};

const normalizePadding = (padding?: Partial<OsmMapPadding>): OsmMapPadding => ({
  ...DEFAULT_PADDING,
  ...(padding ?? {}),
});

const toPosition = (coordinate: OsmCoordinate): [number, number] => [
  coordinate.longitude,
  coordinate.latitude,
];

const fromPosition = (position: number[] | undefined | null): OsmCoordinate | null => {
  if (!position || position.length < 2) {
    return null;
  }
  const [longitude, latitude] = position;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
};

const resolveMapStyleUrl = ({
  mapStyleUrl,
  tileUrlTemplate,
  tileFilterCss,
  backgroundColor,
}: Pick<OsmMapViewProps, 'mapStyleUrl' | 'tileUrlTemplate' | 'tileFilterCss' | 'backgroundColor'>) => {
  if (mapStyleUrl) {
    return mapStyleUrl;
  }

  const isDarkFallback =
    Boolean(tileFilterCss) ||
    backgroundColor === OSM_MAXIM_DARK_BACKGROUND;

  return isDarkFallback ? OSM_VECTOR_DARK_STYLE : OSM_VECTOR_LIGHT_STYLE_URL;
};

const buildBounds = (coordinates: OsmCoordinate[]) => {
  const validCoordinates = coordinates.filter(
    (coordinate) =>
      Number.isFinite(coordinate.latitude) &&
      Number.isFinite(coordinate.longitude),
  );

  if (validCoordinates.length === 0) {
    return null;
  }

  return validCoordinates.reduce(
    (bounds, coordinate) => ({
      north: Math.max(bounds.north, coordinate.latitude),
      south: Math.min(bounds.south, coordinate.latitude),
      east: Math.max(bounds.east, coordinate.longitude),
      west: Math.min(bounds.west, coordinate.longitude),
    }),
    {
      north: validCoordinates[0].latitude,
      south: validCoordinates[0].latitude,
      east: validCoordinates[0].longitude,
      west: validCoordinates[0].longitude,
    },
  );
};

const approximateCirclePolygon = (
  center: OsmCoordinate,
  radiusMeters: number,
  segments = 48,
): OsmCoordinate[] => {
  const earthRadiusMeters = 6378137;
  const angularDistance = Math.max(radiusMeters, 0.1) / earthRadiusMeters;
  const latitudeRad = (center.latitude * Math.PI) / 180;
  const longitudeRad = (center.longitude * Math.PI) / 180;
  const ring: OsmCoordinate[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const bearing = (2 * Math.PI * index) / segments;
    const sinLatitude = Math.sin(latitudeRad);
    const cosLatitude = Math.cos(latitudeRad);
    const sinAngularDistance = Math.sin(angularDistance);
    const cosAngularDistance = Math.cos(angularDistance);
    const latitude = Math.asin(
      sinLatitude * cosAngularDistance +
        cosLatitude * sinAngularDistance * Math.cos(bearing),
    );
    const longitude =
      longitudeRad +
      Math.atan2(
        Math.sin(bearing) * sinAngularDistance * cosLatitude,
        cosAngularDistance - sinLatitude * Math.sin(latitude),
      );

    ring.push({
      latitude: (latitude * 180) / Math.PI,
      longitude: (longitude * 180) / Math.PI,
    });
  }

  return ring;
};

const markerAnchorForKind = (kind?: OsmMarkerSpec['kind']) => {
  if (kind === 'pin') {
    return { x: 0.5, y: 1 };
  }

  return { x: 0.5, y: 0.5 };
};

const withAlpha = (value: string | undefined, fallback: string) => value ?? fallback;

function MarkerShell({
  children,
  size,
  rotationDeg = 0,
  style,
}: PropsWithChildren<{
  children: ReactNode;
  size: number;
  rotationDeg?: number;
  style?: ViewProps['style'];
}>) {
  return (
    <View
      style={[
        styles.markerShell,
        {
          width: size,
          minHeight: size,
          transform: [{ rotate: `${rotationDeg}deg` }],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function MarkerContent({ marker }: { marker: OsmMarkerSpec }) {
  const size = marker.size ?? (marker.kind === 'pin' ? 34 : 30);
  const color = marker.color ?? '#1D4ED8';
  const fillColor = marker.fillColor ?? '#FFFFFF';
  const borderColor = marker.borderColor ?? color;
  const label = (marker.label ?? '').slice(0, 2).toUpperCase();
  const initials = (marker.initials ?? marker.label ?? 'D').slice(0, 2).toUpperCase();

  if (marker.kind === 'navigation') {
    return (
      <MarkerShell size={size} rotationDeg={marker.rotationDeg}>
        <View
          style={[
            styles.navigationMarker,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
            },
          ]}
        >
          <View
            style={[
              styles.navigationArrow,
              {
                borderLeftWidth: Math.round(size * 0.18),
                borderRightWidth: Math.round(size * 0.18),
                borderBottomWidth: Math.round(size * 0.36),
              },
            ]}
          />
        </View>
      </MarkerShell>
    );
  }

  if (marker.kind === 'pin') {
    return (
      <MarkerShell size={size} style={{ minHeight: size + 12 }}>
        <View
          style={[
            styles.pinMarkerBody,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: fillColor,
              borderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.pinMarkerText,
              {
                color: borderColor,
                fontSize: Math.max(11, Math.round(size * 0.36)),
              },
            ]}
          >
            {label || initials}
          </Text>
        </View>
        <View
          style={[
            styles.pinMarkerPointer,
            {
              borderLeftWidth: Math.round(size * 0.18),
              borderRightWidth: Math.round(size * 0.18),
              borderTopWidth: Math.round(size * 0.3),
              borderTopColor: borderColor,
            },
          ]}
        />
      </MarkerShell>
    );
  }

  if (marker.kind === 'avatar') {
    return (
      <MarkerShell size={size}>
        <View
          style={[
            styles.avatarMarker,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        >
          <Avatar
            name={marker.label ?? marker.initials ?? 'Driver'}
            imageUri={marker.imageUri}
            fallbackText={initials}
            backgroundColor={color}
            size={size}
            style={styles.avatarMarkerAvatar}
            textStyle={[
              styles.avatarMarkerText,
              {
                fontSize: Math.max(11, Math.round(size * 0.36)),
              },
            ]}
          />
        </View>
      </MarkerShell>
    );
  }

  return (
    <MarkerShell size={size}>
      <View
        style={[
          styles.dotMarker,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            borderColor: fillColor,
          },
        ]}
      />
    </MarkerShell>
  );
}

function PolylineOverlay({ polyline }: { polyline: OsmPolylineSpec }) {
  if (polyline.coordinates.length === 0) {
    return null;
  }

  return (
    <ShapeSource
      id={`polyline-source-${polyline.id}`}
      lineMetrics={!polyline.lineDashPattern}
      shape={{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: polyline.coordinates.map(toPosition),
        },
        properties: {},
      }}
    >
      <LineLayer
        id={`polyline-layer-${polyline.id}`}
        style={{
          lineColor: polyline.strokeColor,
          lineWidth: polyline.strokeWidth ?? 3,
          lineCap: 'round',
          lineJoin: 'round',
          ...(polyline.lineDashPattern
            ? { lineDasharray: ['literal', polyline.lineDashPattern] }
            : null),
        }}
      />
    </ShapeSource>
  );
}

function PolygonOverlay({ polygon }: { polygon: OsmPolygonSpec }) {
  if (polygon.coordinates.length === 0) {
    return null;
  }

  const ring = polygon.coordinates.map(toPosition);
  const closedRing =
    ring.length > 2 &&
    (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
      ? [...ring, ring[0]]
      : ring;

  return (
    <ShapeSource
      id={`polygon-source-${polygon.id}`}
      shape={{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [closedRing],
        },
        properties: {},
      }}
    >
      <FillLayer
        id={`polygon-fill-${polygon.id}`}
        style={{
          fillColor: polygon.fillColor,
          fillOpacity: 1,
        }}
      />
      <LineLayer
        id={`polygon-outline-${polygon.id}`}
        style={{
          lineColor: polygon.strokeColor,
          lineWidth: polygon.strokeWidth ?? 2,
          lineCap: 'round',
          lineJoin: 'round',
          ...(polygon.lineDashPattern
            ? { lineDasharray: ['literal', polygon.lineDashPattern] }
            : null),
        }}
      />
    </ShapeSource>
  );
}

function CircleOverlay({ circle }: { circle: OsmCircleSpec }) {
  const coordinates = approximateCirclePolygon(circle.center, circle.radius);
  const ring = coordinates.map(toPosition);

  return (
    <ShapeSource
      id={`circle-source-${circle.id}`}
      shape={{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
        properties: {},
      }}
    >
      <FillLayer
        id={`circle-fill-${circle.id}`}
        style={{
          fillColor: circle.fillColor,
          fillOpacity: 1,
        }}
      />
      <LineLayer
        id={`circle-outline-${circle.id}`}
        style={{
          lineColor: circle.strokeColor,
          lineWidth: circle.strokeWidth ?? 2,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </ShapeSource>
  );
}

export const OsmMapView = forwardRef<OsmMapViewHandle, OsmMapViewProps>(function OsmMapView(
  {
    style,
    initialRegion,
    mapStyleUrl,
    tileUrlTemplate,
    tileFilterCss,
    backgroundColor,
    markers = [],
    polylines = [],
    polygons = [],
    circles = [],
    mapPadding,
    pointerEvents,
    scrollEnabled = true,
    zoomEnabled = true,
    rotateEnabled = false,
    pitchEnabled = false,
    onMapReady,
  },
  ref,
) {
  const resolvedPadding = useMemo(() => normalizePadding(mapPadding), [mapPadding]);
  const resolvedMapStyleUrl = useMemo(
    () =>
      resolveMapStyleUrl({
        mapStyleUrl,
        tileUrlTemplate,
        tileFilterCss,
        backgroundColor,
      }),
    [backgroundColor, mapStyleUrl, tileFilterCss, tileUrlTemplate],
  );
  const resolvedBackgroundColor =
    backgroundColor ??
    (resolvedMapStyleUrl === OSM_VECTOR_DARK_STYLE
      ? OSM_MAXIM_DARK_BACKGROUND
      : OSM_LIGHT_BACKGROUND);

  const mapViewRef = useRef<MapViewRef | null>(null);
  const cameraRef = useRef<CameraRef | null>(null);
  const isReadyRef = useRef(false);
  const pendingCommandsRef = useRef<PendingCommand[]>([]);
  const mapReadyCallbackRef = useRef(onMapReady);

  useEffect(() => {
    mapReadyCallbackRef.current = onMapReady;
  }, [onMapReady]);

  const runPendingCommands = useCallback(() => {
    if (!cameraRef.current) {
      return;
    }

    const commands = [...pendingCommandsRef.current];
    pendingCommandsRef.current = [];

    for (const command of commands) {
      if (command.type === 'animateCamera') {
        if (!command.camera.center) {
          continue;
        }
        cameraRef.current.setCamera({
          centerCoordinate: toPosition(command.camera.center),
          zoomLevel: command.camera.zoom,
          pitch: command.camera.pitch,
          heading: command.camera.heading,
          padding: {
            paddingTop: resolvedPadding.top,
            paddingRight: resolvedPadding.right,
            paddingBottom: resolvedPadding.bottom,
            paddingLeft: resolvedPadding.left,
          },
          animationDuration: command.duration,
          animationMode: command.duration === 0 ? 'moveTo' : 'easeTo',
        });
        continue;
      }

      if (command.coordinates.length === 1) {
        const onlyCoordinate = command.coordinates[0];
        cameraRef.current.setCamera({
          centerCoordinate: toPosition(onlyCoordinate),
          zoomLevel: 18,
          padding: {
            paddingTop: command.padding.top,
            paddingRight: command.padding.right,
            paddingBottom: command.padding.bottom,
            paddingLeft: command.padding.left,
          },
          animationDuration: command.animated ? 350 : 0,
          animationMode: command.animated ? 'easeTo' : 'moveTo',
        });
        continue;
      }

      const bounds = buildBounds(command.coordinates);
      if (!bounds) {
        continue;
      }

      cameraRef.current.fitBounds(
        [bounds.east, bounds.north],
        [bounds.west, bounds.south],
        [command.padding.top, command.padding.right, command.padding.bottom, command.padding.left],
        command.animated ? 350 : 0,
      );
    }
  }, [resolvedPadding.bottom, resolvedPadding.left, resolvedPadding.right, resolvedPadding.top]);

  const queueOrRun = useCallback((command: PendingCommand) => {
    if (!isReadyRef.current || !cameraRef.current) {
      pendingCommandsRef.current.push(command);
      return;
    }

    pendingCommandsRef.current.push(command);
    runPendingCommands();
  }, [runPendingCommands]);

  useImperativeHandle(
    ref,
    () => ({
      animateCamera(camera, options) {
        if (!camera.center) {
          return;
        }

        queueOrRun({
          type: 'animateCamera',
          camera,
          duration: options?.duration ?? 350,
        });
      },
      fitToCoordinates(coordinates, options) {
        if (coordinates.length === 0) {
          return;
        }

        queueOrRun({
          type: 'fitToCoordinates',
          coordinates,
          padding: normalizePadding(options?.edgePadding),
          animated: options?.animated !== false,
        });
      },
      async getCamera() {
        const [center, zoom] = await Promise.all([
          mapViewRef.current?.getCenter(),
          mapViewRef.current?.getZoom(),
        ]);

        return {
          center: fromPosition(center),
          zoom: typeof zoom === 'number' ? zoom : regionToZoom(initialRegion),
        };
      },
    }),
    [initialRegion, queueOrRun],
  );

  if (!MAPLIBRE_AVAILABLE) {
    return (
      <View
        style={[styles.unavailableContainer, { backgroundColor: resolvedBackgroundColor }, style]}
        pointerEvents={pointerEvents}
      >
        <Text style={styles.unavailableTitle}>Vector map requires a development build</Text>
        <Text style={styles.unavailableText}>
          Rebuild the app with the MapLibre native module enabled instead of running it in Expo Go.
        </Text>
      </View>
    );
  }

  return (
    <View style={style} pointerEvents={pointerEvents}>
      <MapView
        ref={(instance: MapViewRef | null) => {
          mapViewRef.current = instance;
        }}
        style={StyleSheet.absoluteFill}
        mapStyle={resolvedMapStyleUrl as any}
        localizeLabels
        scrollEnabled={scrollEnabled}
        zoomEnabled={zoomEnabled}
        rotateEnabled={rotateEnabled}
        pitchEnabled={pitchEnabled}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        preferredFramesPerSecond={60}
        onDidFinishLoadingMap={() => {
          isReadyRef.current = true;
          runPendingCommands();
          mapReadyCallbackRef.current?.();
        }}
      >
        <Camera
          ref={(instance: CameraRef | null) => {
            cameraRef.current = instance;
          }}
          defaultSettings={{
            centerCoordinate: toPosition({
              latitude: initialRegion.latitude,
              longitude: initialRegion.longitude,
            }),
            zoomLevel: regionToZoom(initialRegion),
            pitch: 0,
            heading: 0,
            padding: {
              paddingTop: resolvedPadding.top,
              paddingRight: resolvedPadding.right,
              paddingBottom: resolvedPadding.bottom,
              paddingLeft: resolvedPadding.left,
            },
          }}
        />

        {polygons.map((polygon) => (
          <PolygonOverlay key={polygon.id} polygon={polygon} />
        ))}

        {circles.map((circle) => (
          <CircleOverlay key={circle.id} circle={circle} />
        ))}

        {polylines.map((polyline) => (
          <PolylineOverlay key={polyline.id} polyline={polyline} />
        ))}

        {markers.map((marker) => (
          <MarkerView
            key={marker.id}
            coordinate={toPosition(marker.coordinate)}
            anchor={markerAnchorForKind(marker.kind)}
            allowOverlap
            isSelected
          >
            <MarkerContent marker={marker} />
          </MarkerView>
        ))}
      </MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  markerShell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.98)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  navigationArrow: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
    transform: [{ translateY: -1 }],
  },
  pinMarkerBody: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pinMarkerText: {
    fontFamily: 'CircularStdMedium500',
  },
  pinMarkerPointer: {
    marginTop: -2,
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  avatarMarker: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  avatarMarkerAvatar: {
    borderWidth: 3,
    borderColor: '#57C7A8',
    backgroundColor: '#1D4ED8',
  },
  avatarMarkerText: {
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  dotMarker: {
    borderWidth: 3,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  unavailableContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  unavailableTitle: {
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  unavailableText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
});
