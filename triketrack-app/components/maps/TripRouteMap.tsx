import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildRoadAlignedTripPath, dedupeSequentialPoints, polylineDistanceKm } from '../../lib/roadPath';
import { reconstructCompletedTripPath, type RawTripTelemetryPoint } from '../../lib/tripPathReconstruction';
import {
  buildRoadsideDisplayAnchor,
  buildRenderedTripTrace,
  buildTripEndConnector,
  buildTripStartConnector,
  buildRoadCenterlinePath,
  projectPointToRoadPath,
} from '../../lib/tripTrace';
import { OsmMapView, type OsmMapViewHandle } from './OsmMapView';
import {
  LOW_BATTERY_MAP_ACCENT_SOFT,
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
  style: any;
  getRouteRegion: (routePath: LatLng[]) => {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
};

const distanceMetersBetween = (from: LatLng, to: LatLng) =>
  Math.hypot(
    (from.latitude - to.latitude) * 111320,
    (from.longitude - to.longitude) * 111320 * Math.cos((from.latitude * Math.PI) / 180),
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
  style,
  getRouteRegion,
}: TripRouteMapProps) {
  const mapRef = useRef<OsmMapViewHandle | null>(null);
  const lastFocusedRouteSignatureRef = useRef<string | null>(null);
  const [roadAlignedRoutePath, setRoadAlignedRoutePath] = useState<LatLng[]>(routePath);
  const authoritativeStoredEndConnector = useMemo(
    () => dedupeSequentialPoints(dashedEndConnector),
    [dashedEndConnector],
  );
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
  const endpointSeedPath = useMemo(
    () =>
      dedupeSequentialPoints(
        [
          matchedStartPoint ?? rawStartPoint ?? routePath[0] ?? null,
          endPoint ?? rawEndPoint ?? routePath.at(-1) ?? null,
        ].filter((point): point is LatLng => Boolean(point)),
      ),
    [endPoint, matchedStartPoint, rawEndPoint, rawStartPoint, routePath],
  );

  useEffect(() => {
    let cancelled = false;

    setRoadAlignedRoutePath(routePath);
    const telemetryPath = dedupeSequentialPoints(
      rawTelemetry.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    );

    if (routePath.length < 2 && telemetryPath.length < 2) {
      return () => {
        cancelled = true;
      };
    }

    const shouldHonorAuthoritativeSavedRoute = lockSavedRoute && routePath.length > 1;
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
      !shouldTreatSavedPathAsSuspicious &&
      routePath.length >= 8 &&
      (telemetryPath.length === 0 || routePath.length >= telemetryPath.length);

    if (shouldHoldSavedRoute) {
      return () => {
        cancelled = true;
      };
    }

    const shouldTrustSavedRoutePath =
      routePath.length >= 8 &&
      (telemetryPath.length === 0 || routePath.length >= telemetryPath.length);

    if (shouldTrustSavedRoutePath) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const reconstructedPath =
        telemetryPath.length >= 2
          ? await reconstructCompletedTripPath(rawTelemetry).then((result) =>
              result.reconstructedPath.length > 1 ? result.reconstructedPath : telemetryPath,
            )
          : routePath;
      const sourcePath =
        reconstructedPath.length > 1 &&
        (telemetryPath.length >= routePath.length || shouldTreatSavedPathAsSuspicious)
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
      });
      if (!cancelled && roadAlignedPath.length > 1) {
        setRoadAlignedRoutePath(roadAlignedPath);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [endpointSeedPath, lockSavedRoute, rawTelemetry, routePath]);

  const renderedTrace = useMemo(
    () =>
      buildRenderedTripTrace({
        rawStartPoint,
        matchedPoints: roadAlignedRoutePath,
        dashedConnector: dashedStartConnector,
      }),
    [dashedStartConnector, rawStartPoint, roadAlignedRoutePath],
  );
  const offRoadEndDistanceMeters = useMemo(() => {
    if (!rawEndPoint || !endPoint) {
      return 0;
    }
    return distanceMetersBetween(rawEndPoint, endPoint);
  }, [endPoint, rawEndPoint]);
  const displayRoutePath = useMemo(() => {
    const baseRoutePath = renderedTrace.solidOnRoadPath;
    if (lockSavedRoute && baseRoutePath.length > 1) {
      return baseRoutePath;
    }
    if (
      baseRoutePath.length < 2 ||
      !endPoint ||
      !rawEndPoint ||
      offRoadEndDistanceMeters < 3 ||
      offRoadEndDistanceMeters > 250
    ) {
      return baseRoutePath;
    }

    const startProjection = projectPointToRoadPath(baseRoutePath[0], baseRoutePath);
    const endProjection = projectPointToRoadPath(endPoint, baseRoutePath);
    if (!startProjection || !endProjection) {
      return dedupeSequentialPoints([...baseRoutePath.slice(0, -1), endPoint]);
    }

    const trimmedRoutePath = buildRoadCenterlinePath({
      roadPath: baseRoutePath,
      startProjection,
      endProjection,
      maxBacktrackKm: 1,
    });

      return trimmedRoutePath.length > 1 ? trimmedRoutePath : dedupeSequentialPoints([baseRoutePath[0], endPoint]);
  }, [endPoint, lockSavedRoute, offRoadEndDistanceMeters, rawEndPoint, renderedTrace.solidOnRoadPath]);
  const startRoadPoint = displayRoutePath[0] ?? matchedStartPoint ?? routePath[0] ?? null;
  const endRoadPoint =
    displayRoutePath[displayRoutePath.length - 1] ?? endPoint ?? routePath.at(-1) ?? null;
  const startDisplayAnchor = useMemo(
    () =>
      buildRoadsideDisplayAnchor({
        roadPath: displayRoutePath,
        anchorPoint: startRoadPoint,
        referencePoint: rawStartPoint ?? dashedStartConnector[0] ?? null,
        defaultSide: 'left',
        anchorRole: 'start',
      }),
    [dashedStartConnector, displayRoutePath, rawStartPoint, startRoadPoint],
  );
  const resolvedStartConnector = useMemo(() => {
    if (startDisplayAnchor && startRoadPoint) {
      const projectedStart = projectPointToRoadPath(startRoadPoint, displayRoutePath);
      const connectorTarget = projectedStart?.point ?? startRoadPoint;
      if (distanceMetersBetween(startDisplayAnchor, connectorTarget) >= 3) {
        return [startDisplayAnchor, connectorTarget];
      }
    }
    const liveConnector = buildTripStartConnector({
      rawStartPoint,
      firstSnappedPoint: matchedStartPoint ?? displayRoutePath[0] ?? null,
      roadPath: displayRoutePath,
    });
    if (liveConnector.length === 2) {
      return liveConnector;
    }
    if (dashedStartConnector.length === 2) {
      return buildTripStartConnector({
        rawStartPoint: dashedStartConnector[0] ?? null,
        firstSnappedPoint: dashedStartConnector[1] ?? null,
        roadPath: displayRoutePath,
      });
    }
    return [];
  }, [
    dashedStartConnector,
    displayRoutePath,
    matchedStartPoint,
    rawStartPoint,
    startDisplayAnchor,
    startRoadPoint,
  ]);
  const renderedRouteStartPoint =
    resolvedStartConnector.length === 2
      ? resolvedStartConnector[0]
      : displayRoutePath[0] ?? matchedStartPoint ?? routePath[0] ?? rawStartPoint ?? null;
  const endDisplayAnchor = useMemo(
    () =>
      buildRoadsideDisplayAnchor({
        roadPath: displayRoutePath,
        anchorPoint: endRoadPoint,
        referencePoint: rawEndPoint ?? dashedEndConnector[1] ?? null,
        defaultSide: 'right',
        anchorRole: 'end',
      }),
    [dashedEndConnector, displayRoutePath, endRoadPoint, rawEndPoint],
  );
  const resolvedEndConnector = useMemo(() => {
    const shouldUseStoredEndConnector =
      authoritativeStoredEndConnector.length === 2 &&
      Boolean(endPoint) &&
      distanceMetersBetween(
        authoritativeStoredEndConnector[authoritativeStoredEndConnector.length - 1],
        endPoint as LatLng,
      ) <= 12;
    if (shouldUseStoredEndConnector) {
      return authoritativeStoredEndConnector;
    }
    if (endDisplayAnchor && endRoadPoint) {
      const projectedEnd = projectPointToRoadPath(endRoadPoint, displayRoutePath);
      const connectorTarget = projectedEnd?.point ?? endRoadPoint;
      if (distanceMetersBetween(connectorTarget, endDisplayAnchor) >= 3) {
        return [connectorTarget, endDisplayAnchor];
      }
    }
    const liveConnector = buildTripEndConnector({
      rawEndPoint,
      lastSnappedPoint: endPoint ?? displayRoutePath[displayRoutePath.length - 1] ?? null,
      roadPath: displayRoutePath,
    });
    if (liveConnector.length === 2) {
      return liveConnector;
    }
    if (dashedEndConnector.length === 2) {
      return buildTripEndConnector({
        rawEndPoint: dashedEndConnector[1] ?? null,
        lastSnappedPoint: dashedEndConnector[0] ?? null,
        roadPath: displayRoutePath,
      });
    }
    return [];
  }, [
    authoritativeStoredEndConnector,
    dashedEndConnector,
    displayRoutePath,
    endDisplayAnchor,
    endPoint,
    endRoadPoint,
    rawEndPoint,
  ]);
  const renderedRouteEndPoint =
    authoritativeStoredEndConnector.length === 2 && endPoint
      ? endPoint
      : resolvedEndConnector.length === 2
        ? resolvedEndConnector[1]
      : displayRoutePath[displayRoutePath.length - 1] ?? endPoint ?? routePath.at(-1) ?? rawEndPoint ?? null;
  const regionSeedPath = useMemo(
    () =>
      [
        ...resolvedStartConnector,
        ...displayRoutePath,
        ...resolvedEndConnector,
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
      resolvedStartConnector,
      resolvedEndConnector,
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
  const geofenceStrokeColor = isLowBatteryMapMode ? MAXIM_ROUTE_CORE_DARK : 'rgba(90,103,216,0.38)';
  const geofencePolygonStrokeColor = isLowBatteryMapMode ? MAXIM_ROUTE_CORE_DARK : 'rgba(90,103,216,0.16)';
  const geofenceFillColor = isLowBatteryMapMode ? LOW_BATTERY_MAP_ACCENT_SOFT : 'rgba(90,103,216,0.03)';
  const routeCasingColor = isLowBatteryMapMode ? MAXIM_ROUTE_CASING_DARK : MAXIM_ROUTE_CASING_LIGHT;
  const routeCoreColor = isLowBatteryMapMode ? MAXIM_ROUTE_CORE_DARK : MAXIM_ROUTE_CORE_LIGHT;
  const connectorColor = isLowBatteryMapMode ? MAXIM_ROUTE_CORE_DARK : 'rgba(107,114,128,0.78)';
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
      ...(resolvedStartConnector.length === 2
        ? [
            {
              id: 'start-connector',
              coordinates: resolvedStartConnector,
              strokeColor: connectorColor,
              strokeWidth: 2,
              lineDashPattern: [6, 6],
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
      ...(resolvedEndConnector.length === 2
        ? [
            {
              id: 'end-connector',
              coordinates: resolvedEndConnector,
              strokeColor: connectorColor,
              strokeWidth: 2,
              lineDashPattern: [6, 6],
            },
          ]
        : []),
    ],
    [
      closedGeofence,
      connectorColor,
      displayRoutePath,
      geofenceStrokeColor,
      resolvedEndConnector,
      resolvedStartConnector,
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
              label: 'E',
              size: 34,
            },
          ]
        : []),
    ],
    [renderedRouteEndPoint, renderedRouteStartPoint],
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
