import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildRoadAlignedTripPath, dedupeSequentialPoints, polylineDistanceKm } from '../../lib/roadPath';
import { reconstructCompletedTripPath, type RawTripTelemetryPoint } from '../../lib/tripPathReconstruction';
import {
  buildRoadCenterlinePath,
  projectPointToRoadPath,
  type TripRoadProjection,
} from '../../lib/tripTrace';
import { OsmMapView, type OsmMapViewHandle } from './OsmMapView';
import {
  MAP_GEOFENCE_FILL_DARK,
  MAP_GEOFENCE_FILL_LIGHT,
  MAP_GEOFENCE_STROKE_DARK,
  MAP_GEOFENCE_STROKE_LIGHT,
  MAXIM_ROUTE_CASING_DARK,
  MAXIM_ROUTE_CASING_LIGHT,
  MAXIM_ROUTE_CORE_DARK,
  MAXIM_ROUTE_CORE_LIGHT,
  MAXIM_ROUTE_WIDTH_CASING_DETAIL,
  MAXIM_ROUTE_WIDTH_CORE_DETAIL,
} from '../../screens/homeScreenShared';
import {
  OSM_VECTOR_DARK_STYLE,
  OSM_LIGHT_BACKGROUND,
  OSM_MAXIM_DARK_BACKGROUND,
  OSM_VECTOR_LIGHT_STYLE_URL,
} from './osmTheme';

type LatLng = { latitude: number; longitude: number };

type TripRouteMapProps = {
  routePath: LatLng[];
  rawStartPoint?: LatLng | null;
  matchedStartPoint?: LatLng | null;
  dashedStartConnector?: LatLng[];
  rawEndPoint?: LatLng | null;
  endPoint?: LatLng | null;
  dashedEndConnector?: LatLng[];
  rawTelemetry?: RawTripTelemetryPoint[];
  geofence: LatLng[];
  lockSavedRoute?: boolean;
  isLowBatteryMapMode?: boolean;
  replayMarkerCoordinate?: LatLng | null;
  replayMarkerHeadingDeg?: number | null;
  replayCameraFollowToken?: number;
  style: any;
  getRouteRegion: (routePath: LatLng[]) => {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
};

const COMPLETED_ENDPOINT_CONNECTOR_MAX_METERS = 35;

const isFiniteLatLng = (point: LatLng | null | undefined): point is LatLng =>
  Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude),
  );

export function TripRouteMap({
  routePath,
  rawStartPoint = null,
  matchedStartPoint = null,
  dashedStartConnector = [],
  rawEndPoint = null,
  endPoint = null,
  dashedEndConnector = [],
  rawTelemetry = [],
  geofence,
  lockSavedRoute = false,
  isLowBatteryMapMode = false,
  replayMarkerCoordinate = null,
  replayMarkerHeadingDeg = null,
  replayCameraFollowToken = 0,
  style,
  getRouteRegion,
}: TripRouteMapProps) {
  const mapRef = useRef<OsmMapViewHandle | null>(null);
  const lastFocusedRouteSignatureRef = useRef<string | null>(null);
  const replayMarkerCoordinateRef = useRef<LatLng | null>(replayMarkerCoordinate);
  const [roadAlignedRoutePath, setRoadAlignedRoutePath] = useState<LatLng[]>(routePath);
  const closedGeofence = useMemo(() => {
    if (geofence.length < 2) {
      return geofence;
    }

    const firstPoint = geofence[0];
    const lastPoint = geofence[geofence.length - 1];
    if (
      firstPoint.latitude === lastPoint.latitude &&
      firstPoint.longitude === lastPoint.longitude
    ) {
      return geofence;
    }

    return [...geofence, firstPoint];
  }, [geofence]);
  const telemetryPath = useMemo(
    () =>
      dedupeSequentialPoints(
        rawTelemetry
          .map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          }))
          .filter(isFiniteLatLng),
      ),
    [rawTelemetry],
  );
  const endpointSeedPath = useMemo(
    () =>
      dedupeSequentialPoints(
        [
          rawStartPoint ?? telemetryPath[0] ?? matchedStartPoint ?? dashedStartConnector[0] ?? routePath[0] ?? null,
          rawEndPoint ??
            telemetryPath.at(-1) ??
            endPoint ??
            dashedEndConnector.at(-1) ??
            routePath.at(-1) ??
            null,
        ].filter(isFiniteLatLng),
      ),
    [
      dashedEndConnector,
      dashedStartConnector,
      endPoint,
      matchedStartPoint,
      rawEndPoint,
      rawStartPoint,
      routePath,
      telemetryPath,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    setRoadAlignedRoutePath(routePath);

    if (routePath.length < 2 && telemetryPath.length < 2) {
      return () => {
        cancelled = true;
      };
    }

    const shouldHonorAuthoritativeSavedRoute =
      lockSavedRoute && routePath.length > 1;
    if (shouldHonorAuthoritativeSavedRoute) {
      return () => {
        cancelled = true;
      };
    }

    const routeDistanceKm = polylineDistanceKm(routePath);
    const shouldTreatSavedPathAsSuspicious =
      routePath.length > 1 &&
      routePath.length <= 6 &&
      routeDistanceKm <= 0.15;
    const shouldHoldSavedRoute =
      lockSavedRoute &&
      routePath.length > 1 &&
      telemetryPath.length < 2 &&
      !shouldTreatSavedPathAsSuspicious &&
      routePath.length >= 8;

    if (shouldHoldSavedRoute) {
      return () => {
        cancelled = true;
      };
    }

    const shouldTrustSavedRoutePath =
      telemetryPath.length < 2 &&
      routePath.length >= 8 &&
      routePath.length >= telemetryPath.length;

    if (shouldTrustSavedRoutePath) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const reconstruction =
        telemetryPath.length >= 2
          ? await reconstructCompletedTripPath(rawTelemetry, {
              useFullRawTrajectory: true,
            })
          : null;
      const reconstructedPath =
        reconstruction && reconstruction.reconstructedPath.length > 1
          ? reconstruction.reconstructedPath
          : telemetryPath.length > 1
            ? telemetryPath
            : routePath;
      const sourcePath =
        telemetryPath.length > 1 && reconstructedPath.length > 1
          ? reconstructedPath
          : shouldTreatSavedPathAsSuspicious && endpointSeedPath.length > 1
            ? endpointSeedPath
            : routePath.length > 2
              ? routePath
              : reconstructedPath.length > 1
                ? reconstructedPath
                : routePath.length > 1
                  ? routePath
                  : telemetryPath;
      const fallbackPath =
        telemetryPath.length > 1
          ? telemetryPath
          : endpointSeedPath.length > 1
            ? endpointSeedPath
            : routePath.length > 1
              ? routePath
              : reconstructedPath.length > 1
                ? reconstructedPath
                : telemetryPath;
      const roadAlignedPath = await buildRoadAlignedTripPath({
        candidatePath: sourcePath,
        fallbackPath,
        preserveDetailedGeometry: telemetryPath.length > 1,
        trustCandidateGeometry:
          Boolean(reconstruction?.routeMatchMetadata?.provider) &&
          reconstruction?.routeMatchMetadata?.provider !== 'local-directional',
      });
      if (!cancelled && roadAlignedPath.length > 1) {
        setRoadAlignedRoutePath(roadAlignedPath);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [endpointSeedPath, lockSavedRoute, rawTelemetry, routePath, telemetryPath]);

  const recordedStartPoint =
    rawStartPoint ?? telemetryPath[0] ?? matchedStartPoint ?? dashedStartConnector[0] ?? routePath[0] ?? null;
  const recordedEndPoint =
    rawEndPoint ??
    telemetryPath.at(-1) ??
    endPoint ??
    dashedEndConnector.at(-1) ??
    routePath.at(-1) ??
    null;
  const baseDisplayRoutePath = useMemo(
    () =>
      dedupeSequentialPoints(
        roadAlignedRoutePath.length > 1
          ? roadAlignedRoutePath
          : routePath.length > 1
            ? routePath
            : telemetryPath,
      ),
    [roadAlignedRoutePath, routePath, telemetryPath],
  );
  const getEndpointProjection = (
    endpoint: LatLng | null,
    fallbackPoint: LatLng | null,
  ): TripRoadProjection | null => {
    if (endpoint && baseDisplayRoutePath.length >= 2) {
      const projection = projectPointToRoadPath(endpoint, baseDisplayRoutePath);
      if (
        projection &&
        projection.distanceKm * 1000 <= COMPLETED_ENDPOINT_CONNECTOR_MAX_METERS
      ) {
        return projection;
      }
    }

    return fallbackPoint && baseDisplayRoutePath.length >= 2
      ? projectPointToRoadPath(fallbackPoint, baseDisplayRoutePath)
      : null;
  };
  const displayRoutePath = useMemo(() => {
    if (baseDisplayRoutePath.length < 2) {
      return baseDisplayRoutePath;
    }
    if (lockSavedRoute) {
      return baseDisplayRoutePath;
    }

    const startProjection = getEndpointProjection(recordedStartPoint, baseDisplayRoutePath[0]);
    const endProjection = getEndpointProjection(
      recordedEndPoint,
      baseDisplayRoutePath[baseDisplayRoutePath.length - 1],
    );
    if (!startProjection || !endProjection) {
      return baseDisplayRoutePath;
    }

    const trimmedRoutePath = buildRoadCenterlinePath({
      roadPath: baseDisplayRoutePath,
      startProjection,
      endProjection,
      maxBacktrackKm: 1,
    });

    return trimmedRoutePath.length > 1 ? trimmedRoutePath : baseDisplayRoutePath;
  }, [baseDisplayRoutePath, lockSavedRoute, recordedEndPoint, recordedStartPoint]);
  const renderedRouteStartPoint = displayRoutePath[0] ?? matchedStartPoint ?? routePath[0] ?? null;
  const renderedRouteEndPoint =
    displayRoutePath[displayRoutePath.length - 1] ?? endPoint ?? routePath.at(-1) ?? null;
  const regionSeedPath = useMemo(
    () =>
      [
        ...displayRoutePath,
        ...(renderedRouteStartPoint ? [renderedRouteStartPoint] : []),
        ...(renderedRouteEndPoint ? [renderedRouteEndPoint] : []),
      ].filter(
        (point, index, source): point is LatLng =>
          Boolean(point) &&
          source.findIndex(
            (candidate) =>
              candidate &&
              candidate.latitude === point.latitude &&
              candidate.longitude === point.longitude,
          ) === index,
      ),
    [
      displayRoutePath,
      renderedRouteEndPoint,
      renderedRouteStartPoint,
    ],
  );
  const routeFitPadding = useMemo(
    () => ({ top: 88, right: 32, bottom: 320, left: 32 }),
    [],
  );
  const routeFocusSignature = useMemo(
    () =>
      regionSeedPath
        .map((point) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`)
        .join('|'),
    [regionSeedPath],
  );
  const geofenceStrokeColor = isLowBatteryMapMode ? MAP_GEOFENCE_STROKE_DARK : MAP_GEOFENCE_STROKE_LIGHT;
  const geofencePolygonStrokeColor = geofenceStrokeColor;
  const geofenceFillColor = isLowBatteryMapMode ? MAP_GEOFENCE_FILL_DARK : MAP_GEOFENCE_FILL_LIGHT;
  const routeCasingColor = isLowBatteryMapMode ? MAXIM_ROUTE_CASING_DARK : MAXIM_ROUTE_CASING_LIGHT;
  const routeCoreColor = isLowBatteryMapMode ? MAXIM_ROUTE_CORE_DARK : MAXIM_ROUTE_CORE_LIGHT;
  const osmMapStyleUrl = isLowBatteryMapMode ? OSM_VECTOR_DARK_STYLE : OSM_VECTOR_LIGHT_STYLE_URL;
  const osmBackgroundColor = isLowBatteryMapMode ? OSM_MAXIM_DARK_BACKGROUND : OSM_LIGHT_BACKGROUND;
  const tripPolylines = useMemo(
    () => [
      ...(closedGeofence.length > 2
        ? [
            {
              id: 'geofence-outline',
              coordinates: closedGeofence,
              strokeColor: geofenceStrokeColor,
              strokeWidth: 1.5,
              lineDashPattern: [8, 6],
            },
          ]
        : []),
      ...(displayRoutePath.length > 1
        ? [
            {
              id: 'route-casing',
              coordinates: displayRoutePath,
              strokeColor: routeCasingColor,
              strokeWidth: MAXIM_ROUTE_WIDTH_CASING_DETAIL,
            },
            {
              id: 'route-core',
              coordinates: displayRoutePath,
              strokeColor: routeCoreColor,
              strokeWidth: MAXIM_ROUTE_WIDTH_CORE_DETAIL,
            },
          ]
        : []),
    ],
    [
      closedGeofence,
      displayRoutePath,
      geofenceStrokeColor,
      routeCasingColor,
      routeCoreColor,
    ],
  );
  const tripMarkers = useMemo(
    () => [
      ...(renderedRouteStartPoint
        ? [
            {
              id: 'trip-start',
              coordinate: renderedRouteStartPoint,
              kind: 'pin' as const,
              color: '#22C55E',
              fillColor: '#FFFFFF',
              borderColor: '#22C55E',
              label: 'S',
              size: 34,
            },
          ]
        : []),
      ...(renderedRouteEndPoint
        ? [
            {
              id: 'trip-end',
              coordinate: renderedRouteEndPoint,
              kind: 'pin' as const,
              color: '#EF4444',
              fillColor: '#FFFFFF',
              borderColor: '#EF4444',
              label: 'E',
              size: 34,
            },
          ]
        : []),
      ...(replayMarkerCoordinate
        ? [
            {
              id: 'trip-replay-driver',
              coordinate: replayMarkerCoordinate,
              kind: 'location' as const,
              color: '#E53935',
              size: 44,
            },
          ]
        : []),
    ],
    [renderedRouteEndPoint, renderedRouteStartPoint, replayMarkerCoordinate, replayMarkerHeadingDeg],
  );
  const tripPolygons = useMemo(
    () => [
      {
        id: 'trip-geofence',
        coordinates: geofence,
        strokeColor: geofencePolygonStrokeColor,
        fillColor: geofenceFillColor,
        strokeWidth: 1,
      },
    ],
    [geofence, geofenceFillColor, geofencePolygonStrokeColor],
  );

  const focusRoute = useCallback(() => {
    if (!mapRef.current || regionSeedPath.length === 0) {
      return;
    }
    if (lastFocusedRouteSignatureRef.current === routeFocusSignature) {
      return;
    }

    lastFocusedRouteSignatureRef.current = routeFocusSignature;

    const timer = setTimeout(() => {
      if (!mapRef.current) {
        return;
      }

      if (regionSeedPath.length > 1) {
        mapRef.current.fitToCoordinates(regionSeedPath, {
          edgePadding: routeFitPadding,
          animated: false,
        });
        return;
      }

      mapRef.current.animateCamera(
        {
          center: regionSeedPath[0],
          zoom: 18,
          pitch: 0,
          heading: 0,
        },
        { duration: 0 },
      );
    }, 30);

    return () => clearTimeout(timer);
  }, [regionSeedPath, routeFitPadding, routeFocusSignature]);

  useEffect(() => {
    return focusRoute();
  }, [focusRoute]);

  useEffect(() => {
    replayMarkerCoordinateRef.current = replayMarkerCoordinate;
  }, [replayMarkerCoordinate]);

  useEffect(() => {
    const coordinate = replayMarkerCoordinateRef.current;
    if (!mapRef.current || !coordinate) {
      return;
    }

    mapRef.current.animateCamera(
      {
        center: coordinate,
        zoom: 18.2,
        pitch: 0,
        heading: 0,
      },
      { duration: 900 },
    );
  }, [replayCameraFollowToken]);

  return (
    <OsmMapView
      ref={(ref: OsmMapViewHandle | null) => {
        mapRef.current = ref;
      }}
      style={style}
      initialRegion={getRouteRegion(regionSeedPath)}
      mapStyleUrl={osmMapStyleUrl}
      backgroundColor={osmBackgroundColor}
      rotateEnabled={false}
      scrollEnabled
      zoomEnabled
      pitchEnabled={false}
      polylines={tripPolylines}
      polygons={tripPolygons}
      markers={tripMarkers}
      onMapReady={() => {
        focusRoute();
      }}
    />
  );
}
