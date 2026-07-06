import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type StyleSpecification,
} from 'maplibre-gl';
import {
  OSM_RASTER_LIGHT_TILE_URL,
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
  kind?: 'avatar' | 'navigation' | 'pin' | 'apple-pin' | 'dot' | 'location' | 'tricycle';
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

const sourceId = (kind: string, id: string) => `tt-${kind}-${id}`;
const layerId = (kind: string, id: string) => `tt-${kind}-${id}`;

export const OsmMapView = forwardRef<OsmMapViewHandle, OsmMapViewProps>(function OsmMapView(
  {
    style,
    initialRegion,
    mapStyleUrl,
    tileUrlTemplate,
    backgroundColor = '#E5EDF5',
    markers = [],
    polylines = [],
    polygons = [],
    circles = [],
    scrollEnabled = true,
    zoomEnabled = true,
    rotateEnabled = true,
    pitchEnabled = true,
    onMapReady,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef(globalThis.Map ? new globalThis.Map<string, maplibregl.Marker>() : null);
  const isReadyRef = useRef(false);
  const initialCenter = useMemo<[number, number]>(
    () => [initialRegion.longitude, initialRegion.latitude],
    [initialRegion.latitude, initialRegion.longitude],
  );
  const initialZoom = useMemo(() => regionToZoom(initialRegion), [initialRegion]);
  const resolvedStyle = useMemo(
    () => resolveMapStyle({ mapStyleUrl, tileUrlTemplate, backgroundColor }),
    [backgroundColor, mapStyleUrl, tileUrlTemplate],
  );

  useImperativeHandle(
    ref,
    () => ({
      animateCamera(camera, options) {
        const map = mapRef.current;
        if (!map) {
          return;
        }

        map.easeTo({
          center: camera.center ? [camera.center.longitude, camera.center.latitude] : undefined,
          zoom: camera.zoom,
          bearing: camera.heading,
          pitch: camera.pitch,
          duration: options?.duration ?? 350,
        });
      },
      fitToCoordinates(coordinates, options) {
        const map = mapRef.current;
        if (!map || coordinates.length === 0) {
          return;
        }

        const bounds = coordinates.reduce(
          (nextBounds, coordinate) =>
            nextBounds.extend([coordinate.longitude, coordinate.latitude]),
          new maplibregl.LngLatBounds(
            [coordinates[0].longitude, coordinates[0].latitude],
            [coordinates[0].longitude, coordinates[0].latitude],
          ),
        );

        map.fitBounds(bounds as LngLatBoundsLike, {
          padding: normalizePadding(options?.edgePadding),
          duration: options?.animated === false ? 0 : 450,
        });
      },
      async getCamera() {
        const map = mapRef.current;
        if (!map) {
          return { center: null, zoom: initialZoom };
        }

        const center = map.getCenter();
        return {
          center: { latitude: center.lat, longitude: center.lng },
          zoom: map.getZoom(),
        };
      },
    }),
    [initialZoom],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolvedStyle,
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      dragPan: scrollEnabled,
      scrollZoom: zoomEnabled,
      doubleClickZoom: zoomEnabled,
      touchZoomRotate: zoomEnabled || rotateEnabled,
      dragRotate: rotateEnabled,
      pitchWithRotate: pitchEnabled,
    });

    mapRef.current = map;
    map.on('load', () => {
      isReadyRef.current = true;
      syncOverlays(map, markerRefs.current, { markers, polylines, polygons, circles });
      onMapReady?.();
    });

    return () => {
      markerRefs.current?.forEach((marker) => marker.remove());
      markerRefs.current?.clear();
      isReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.setStyle(resolvedStyle);
    isReadyRef.current = false;
    map.once('styledata', () => {
      if (!mapRef.current) {
        return;
      }
      isReadyRef.current = true;
      syncOverlays(map, markerRefs.current, { markers, polylines, polygons, circles });
    });
  }, [resolvedStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReadyRef.current) {
      return;
    }

    syncOverlays(map, markerRefs.current, { markers, polylines, polygons, circles });
  }, [circles, markers, polygons, polylines]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    scrollEnabled ? map.dragPan.enable() : map.dragPan.disable();
    zoomEnabled ? map.scrollZoom.enable() : map.scrollZoom.disable();
    zoomEnabled ? map.doubleClickZoom.enable() : map.doubleClickZoom.disable();
    zoomEnabled || rotateEnabled ? map.touchZoomRotate.enable() : map.touchZoomRotate.disable();
    rotateEnabled ? map.dragRotate.enable() : map.dragRotate.disable();
    pitchEnabled ? map.touchPitch.enable() : map.touchPitch.disable();
  }, [pitchEnabled, rotateEnabled, scrollEnabled, zoomEnabled]);

  return (
    <View style={[styles.container, { backgroundColor }, style]}>
      {createElement('div', {
        ref: containerRef,
        style: styles.mapCanvas as any,
      })}
    </View>
  );
});

const resolveMapStyle = ({
  mapStyleUrl,
  tileUrlTemplate,
  backgroundColor,
}: {
  mapStyleUrl?: string | Record<string, unknown>;
  tileUrlTemplate?: string;
  backgroundColor: string;
}): string | StyleSpecification => {
  if (mapStyleUrl && typeof mapStyleUrl !== 'string') {
    return mapStyleUrl as StyleSpecification;
  }

  if (typeof mapStyleUrl === 'string') {
    return mapStyleUrl || OSM_VECTOR_LIGHT_STYLE_URL;
  }

  const tiles = tileUrlTemplate || OSM_RASTER_LIGHT_TILE_URL;
  return {
    version: 8,
    sources: {
      rasterTiles: {
        type: 'raster',
        tiles: [tiles],
        tileSize: 256,
        attribution: 'MapTiler | OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': backgroundColor },
      },
      {
        id: 'rasterTiles',
        type: 'raster',
        source: 'rasterTiles',
      },
    ],
  };
};

const syncOverlays = (
  map: MapLibreMap,
  markerRefs: globalThis.Map<string, maplibregl.Marker> | null,
  overlay: {
    markers: OsmMarkerSpec[];
    polylines: OsmPolylineSpec[];
    polygons: OsmPolygonSpec[];
    circles: OsmCircleSpec[];
  },
) => {
  syncPolygons(map, overlay.polygons);
  syncPolylines(map, overlay.polylines);
  syncCircles(map, overlay.circles);
  syncMarkers(map, markerRefs, overlay.markers);
};

const syncMarkers = (
  map: MapLibreMap,
  markerRefs: globalThis.Map<string, maplibregl.Marker> | null,
  markers: OsmMarkerSpec[],
) => {
  if (!markerRefs) {
    return;
  }

  const activeIds = new Set(markers.map((marker) => marker.id));
  markerRefs.forEach((marker, id) => {
    if (!activeIds.has(id)) {
      marker.remove();
      markerRefs.delete(id);
    }
  });

  markers.forEach((marker) => {
    const markerElement = buildMarkerElement(marker);
    const existing = markerRefs.get(marker.id);
    if (existing) {
      const replacement = new maplibregl.Marker({ element: markerElement })
        .setLngLat([marker.coordinate.longitude, marker.coordinate.latitude])
        .addTo(map);
      existing.remove();
      markerRefs.set(marker.id, replacement);
      return;
    }

    markerRefs.set(
      marker.id,
      new maplibregl.Marker({ element: markerElement })
        .setLngLat([marker.coordinate.longitude, marker.coordinate.latitude])
        .addTo(map),
    );
  });
};

const buildMarkerElement = (marker: OsmMarkerSpec) => {
  const size = marker.size ?? 28;
  const element = document.createElement('div');
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.borderRadius = `${size / 2}px`;
  element.style.background = marker.fillColor ?? marker.color ?? '#57C7A8';
  element.style.border = `3px solid ${marker.borderColor ?? '#FFFFFF'}`;
  element.style.display = 'flex';
  element.style.alignItems = 'center';
  element.style.justifyContent = 'center';
  element.style.color = '#FFFFFF';
  element.style.fontFamily = 'CircularStdMedium500, sans-serif';
  element.style.fontSize = '10px';
  element.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.2)';
  element.style.transform = marker.rotationDeg ? `rotate(${marker.rotationDeg}deg)` : '';
  element.textContent = marker.initials ?? marker.label ?? '';
  return element;
};

const syncPolylines = (map: MapLibreMap, polylines: OsmPolylineSpec[]) => {
  polylines.forEach((polyline) => {
    const id = sourceId('polyline', polyline.id);
    const layer = layerId('polyline', polyline.id);
    upsertGeoJsonSource(map, id, {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: polyline.coordinates.map(toLngLat),
      },
    });
    if (!map.getLayer(layer)) {
      map.addLayer({
        id: layer,
        type: 'line',
        source: id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': polyline.strokeColor,
          'line-width': polyline.strokeWidth ?? 4,
          'line-dasharray': polyline.lineDashPattern,
        },
      });
    } else {
      map.setPaintProperty(layer, 'line-color', polyline.strokeColor);
      map.setPaintProperty(layer, 'line-width', polyline.strokeWidth ?? 4);
      map.setPaintProperty(layer, 'line-dasharray', polyline.lineDashPattern ?? null);
    }
  });
};

const syncPolygons = (map: MapLibreMap, polygons: OsmPolygonSpec[]) => {
  polygons.forEach((polygon) => {
    const fillSource = sourceId('polygon', polygon.id);
    const fillLayer = layerId('polygon-fill', polygon.id);
    const lineLayer = layerId('polygon-line', polygon.id);
    const coordinates = polygon.coordinates.map(toLngLat);
    const closedCoordinates =
      coordinates.length > 0 &&
      (coordinates[0][0] !== coordinates.at(-1)?.[0] || coordinates[0][1] !== coordinates.at(-1)?.[1])
        ? [...coordinates, coordinates[0]]
        : coordinates;

    upsertGeoJsonSource(map, fillSource, {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [closedCoordinates],
      },
    });
    if (!map.getLayer(fillLayer)) {
      map.addLayer({
        id: fillLayer,
        type: 'fill',
        source: fillSource,
        paint: { 'fill-color': polygon.fillColor },
      });
    } else {
      map.setPaintProperty(fillLayer, 'fill-color', polygon.fillColor);
    }

    if (!map.getLayer(lineLayer)) {
      map.addLayer({
        id: lineLayer,
        type: 'line',
        source: fillSource,
        paint: {
          'line-color': polygon.strokeColor,
          'line-width': polygon.strokeWidth ?? 2,
          'line-dasharray': polygon.lineDashPattern,
        },
      });
    } else {
      map.setPaintProperty(lineLayer, 'line-color', polygon.strokeColor);
      map.setPaintProperty(lineLayer, 'line-width', polygon.strokeWidth ?? 2);
      map.setPaintProperty(lineLayer, 'line-dasharray', polygon.lineDashPattern ?? null);
    }
  });
};

const syncCircles = (map: MapLibreMap, circles: OsmCircleSpec[]) => {
  circles.forEach((circle) => {
    const id = sourceId('circle', circle.id);
    const layer = layerId('circle', circle.id);
    upsertGeoJsonSource(map, id, {
      type: 'Feature',
      properties: { radius: circle.radius },
      geometry: {
        type: 'Point',
        coordinates: toLngLat(circle.center),
      },
    });
    if (!map.getLayer(layer)) {
      map.addLayer({
        id: layer,
        type: 'circle',
        source: id,
        paint: {
          'circle-color': circle.fillColor,
          'circle-stroke-color': circle.strokeColor,
          'circle-stroke-width': circle.strokeWidth ?? 2,
          'circle-radius': Math.max(4, circle.radius / 3),
        },
      });
    } else {
      map.setPaintProperty(layer, 'circle-color', circle.fillColor);
      map.setPaintProperty(layer, 'circle-stroke-color', circle.strokeColor);
      map.setPaintProperty(layer, 'circle-stroke-width', circle.strokeWidth ?? 2);
      map.setPaintProperty(layer, 'circle-radius', Math.max(4, circle.radius / 3));
    }
  });
};

const upsertGeoJsonSource = (map: MapLibreMap, id: string, data: GeoJSON.Feature) => {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(id, { type: 'geojson', data });
};

const toLngLat = (coordinate: OsmCoordinate): [number, number] => [
  coordinate.longitude,
  coordinate.latitude,
];

const normalizePadding = (padding?: Partial<OsmMapPadding>) => ({
  top: padding?.top ?? 60,
  right: padding?.right ?? 60,
  bottom: padding?.bottom ?? 60,
  left: padding?.left ?? 60,
});

const regionToZoom = (region: OsmRegion) => {
  const longitudeDelta = Math.max(0.001, region.longitudeDelta);
  return Math.max(3, Math.min(18, Math.log2(360 / longitudeDelta) + 0.35));
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  mapCanvas: {
    position: 'absolute',
    inset: 0,
  },
});
