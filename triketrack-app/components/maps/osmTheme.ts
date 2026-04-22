const OPEN_FREEMAP_VECTOR_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
const OPEN_FREEMAP_GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const NIGHT_PALETTE = {
  background: '#162235',
  landResidential: '#1B2B3D',
  landWood: '#173348',
  landPark: '#1E3B51',
  landGrass: '#203A4D',
  water: '#102C52',
  waterway: '#2E669B',
  building: '#243649',
  buildingOutline: '#31475D',
  aeroway: '#4A6179',
  roadMinorCasing: '#22384E',
  roadMinor: '#6F8DAA',
  roadMajorCasing: '#2A4864',
  roadMajor: '#A4BED6',
  roadMotorwayCasing: '#345878',
  roadMotorway: '#D1E3F3',
  tunnelCasing: '#223347',
  tunnelRoad: '#587491',
  rail: '#51657D',
  boundaryState: '#55779D',
  boundaryCountry: '#6F93BA',
  labelPrimary: '#E0EBF7',
  labelSecondary: '#B7C9DB',
  labelMuted: '#8EA5BF',
  labelWater: '#8FC1F0',
  halo: '#142235',
  poi: '#C2D2E2',
} as const;

const lineWidth = (stops: Array<[number, number]>) => [
  'interpolate',
  ['exponential', 1.2],
  ['zoom'],
  ...stops.flat(),
];

const textSize = (stops: Array<[number, number]>) => [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...stops.flat(),
];

export const OSM_VECTOR_LIGHT_STYLE_URL =
  'https://tiles.openfreemap.org/styles/liberty';

export const OSM_VECTOR_DARK_STYLE = {
  version: 8,
  glyphs: OPEN_FREEMAP_GLYPHS_URL,
  sources: {
    openmaptiles: {
      type: 'vector',
      url: OPEN_FREEMAP_VECTOR_SOURCE_URL,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': NIGHT_PALETTE.background,
      },
    },
    {
      id: 'landuse_residential',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      maxzoom: 12,
      filter: ['==', ['get', 'class'], 'residential'],
      paint: {
        'fill-color': NIGHT_PALETTE.landResidential,
        'fill-opacity': 0.92,
      },
    },
    {
      id: 'landcover_wood',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: {
        'fill-color': NIGHT_PALETTE.landWood,
        'fill-opacity': 0.78,
      },
    },
    {
      id: 'landcover_grass',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'grass'],
      paint: {
        'fill-color': NIGHT_PALETTE.landGrass,
        'fill-opacity': 0.6,
      },
    },
    {
      id: 'landuse_park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'park'],
      paint: {
        'fill-color': NIGHT_PALETTE.landPark,
        'fill-opacity': 0.76,
      },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: {
        'fill-color': NIGHT_PALETTE.water,
      },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.waterway,
        'line-width': lineWidth([
          [8, 0.6],
          [12, 1.3],
          [20, 5.5],
        ]),
      },
    },
    {
      id: 'aeroway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'aeroway',
      minzoom: 10,
      filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.aeroway,
        'line-opacity': 0.72,
        'line-width': lineWidth([
          [10, 1],
          [15, 2],
          [20, 10],
        ]),
      },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 12,
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
      paint: {
        'fill-color': NIGHT_PALETTE.building,
        'fill-outline-color': NIGHT_PALETTE.buildingOutline,
        'fill-opacity': 0.88,
      },
    },
    {
      id: 'tunnel_minor_casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'tunnel'],
        ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.tunnelCasing,
        'line-width': lineWidth([
          [12, 0.5],
          [14, 1.4],
          [20, 12],
        ]),
      },
    },
    {
      id: 'tunnel_minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'tunnel'],
        ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.tunnelRoad,
        'line-dasharray': [0.8, 0.6],
        'line-width': lineWidth([
          [12, 0.2],
          [14, 0.9],
          [20, 9.5],
        ]),
      },
    },
    {
      id: 'tunnel_major_casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'tunnel'],
        ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'trunk'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.tunnelCasing,
        'line-width': lineWidth([
          [8, 1.1],
          [12, 2.4],
          [20, 17],
        ]),
      },
    },
    {
      id: 'tunnel_major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'tunnel'],
        ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'trunk'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.tunnelRoad,
        'line-dasharray': [0.9, 0.5],
        'line-width': lineWidth([
          [8, 0.5],
          [12, 1.6],
          [20, 13],
        ]),
      },
    },
    {
      id: 'tunnel_motorway_casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'tunnel'],
        ['==', ['get', 'class'], 'motorway'],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.tunnelCasing,
        'line-width': lineWidth([
          [6, 1.3],
          [12, 2.8],
          [20, 18],
        ]),
      },
    },
    {
      id: 'tunnel_motorway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'tunnel'],
        ['==', ['get', 'class'], 'motorway'],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#93B8DB',
        'line-dasharray': [1, 0.55],
        'line-width': lineWidth([
          [6, 0.7],
          [12, 1.9],
          [20, 14],
        ]),
      },
    },
    {
      id: 'road_minor_casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
        ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true],
        ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.roadMinorCasing,
        'line-width': lineWidth([
          [12, 0.4],
          [14, 1.2],
          [20, 14],
        ]),
      },
    },
    {
      id: 'road_minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
        ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true],
        ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.roadMinor,
        'line-width': lineWidth([
          [12, 0.15],
          [14, 0.8],
          [20, 10],
        ]),
      },
    },
    {
      id: 'road_major_casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true],
        ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'trunk'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.roadMajorCasing,
        'line-width': lineWidth([
          [8, 1.1],
          [12, 2.3],
          [20, 18],
        ]),
      },
    },
    {
      id: 'road_major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true],
        ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'trunk'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.roadMajor,
        'line-width': lineWidth([
          [8, 0.45],
          [12, 1.5],
          [20, 14],
        ]),
      },
    },
    {
      id: 'road_motorway_casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true],
        ['==', ['get', 'class'], 'motorway'],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.roadMotorwayCasing,
        'line-width': lineWidth([
          [6, 1.3],
          [12, 2.8],
          [20, 19],
        ]),
      },
    },
    {
      id: 'road_motorway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true],
        ['==', ['get', 'class'], 'motorway'],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.roadMotorway,
        'line-width': lineWidth([
          [6, 0.7],
          [12, 2],
          [20, 15],
        ]),
      },
    },
    {
      id: 'bridge_minor_highlight',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'bridge'],
        ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#84A5C2',
        'line-width': lineWidth([
          [13, 0.4],
          [15, 1],
          [20, 10.5],
        ]),
      },
    },
    {
      id: 'bridge_major_highlight',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'bridge'],
        ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'trunk'], true, false],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#BDD3E7',
        'line-width': lineWidth([
          [8, 0.55],
          [12, 1.6],
          [20, 14.5],
        ]),
      },
    },
    {
      id: 'bridge_motorway_highlight',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'bridge'],
        ['==', ['get', 'class'], 'motorway'],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#E3EEF8',
        'line-width': lineWidth([
          [6, 0.8],
          [12, 2.1],
          [20, 15.5],
        ]),
      },
    },
    {
      id: 'railway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['match', ['get', 'class'], ['rail', 'transit'], true, false],
      layout: {
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.rail,
        'line-opacity': 0.78,
        'line-width': lineWidth([
          [13, 0.4],
          [15, 0.8],
          [20, 3],
        ]),
      },
    },
    {
      id: 'boundary_state',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['==', ['get', 'admin_level'], 4],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.boundaryState,
        'line-opacity': 0.64,
        'line-dasharray': [2, 2],
        'line-width': lineWidth([
          [3, 0.8],
          [10, 1.2],
          [20, 8],
        ]),
      },
    },
    {
      id: 'boundary_country',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['==', ['get', 'admin_level'], 2],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': NIGHT_PALETTE.boundaryCountry,
        'line-opacity': 0.72,
        'line-width': lineWidth([
          [3, 1],
          [8, 1.4],
          [20, 10],
        ]),
      },
    },
    {
      id: 'water_name',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString', 'Point', 'MultiPoint'], true, false],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 350,
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['Noto Sans Italic'],
        'text-size': 12,
      },
      paint: {
        'text-color': NIGHT_PALETTE.labelWater,
        'text-halo-color': NIGHT_PALETTE.halo,
        'text-halo-width': 1,
      },
    },
    {
      id: 'road_name',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 12,
      filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 320,
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-max-angle': 30,
        'text-size': 11,
      },
      paint: {
        'text-color': NIGHT_PALETTE.labelSecondary,
        'text-halo-color': NIGHT_PALETTE.halo,
        'text-halo-width': 1,
        'text-halo-blur': 0.4,
      },
    },
    {
      id: 'poi_label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 15,
      filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 0.7],
      },
      paint: {
        'text-color': NIGHT_PALETTE.poi,
        'text-halo-color': NIGHT_PALETTE.halo,
        'text-halo-width': 1,
        'text-opacity': 0.86,
      },
    },
    {
      id: 'place_suburb',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      maxzoom: 14,
      filter: ['==', ['get', 'class'], 'suburb'],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': textSize([
          [9, 10],
          [14, 12],
        ]),
        'text-transform': 'uppercase',
      },
      paint: {
        'text-color': NIGHT_PALETTE.labelMuted,
        'text-halo-color': NIGHT_PALETTE.halo,
        'text-halo-width': 1.1,
      },
    },
    {
      id: 'place_settlement',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['match', ['get', 'class'], ['village', 'town', 'city', 'state', 'country'], true, false],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': [
          'case',
          ['match', ['get', 'class'], ['city', 'country'], true, false],
          ['literal', ['Noto Sans Bold']],
          ['literal', ['Noto Sans Regular']],
        ],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3, ['match', ['get', 'class'], ['country'], 12, ['city'], 11, 10],
          8, ['match', ['get', 'class'], ['country'], 16, ['city'], 15, ['town'], 13, 12],
          12, ['match', ['get', 'class'], ['country'], 19, ['city'], 18, ['town'], 15, 13],
        ],
      },
      paint: {
        'text-color': NIGHT_PALETTE.labelPrimary,
        'text-halo-color': NIGHT_PALETTE.halo,
        'text-halo-width': 1.25,
        'text-halo-blur': 0.6,
      },
    },
  ],
} as const;

export const OSM_LIGHT_BACKGROUND = '#E5EDF5';
export const OSM_MAXIM_DARK_BACKGROUND = '#18263A';
