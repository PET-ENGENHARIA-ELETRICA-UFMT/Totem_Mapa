/**
 * Camada de Lógica: utils.js
 * Ponto de compatibilidade que reexporta utilitários espaciais e constantes de spatialUtils.js
 */

export * from './spatialUtils.js';

/**
 * Extrai ponto de entrada ou centróide aproximado de uma feature GeoJSON
 */
export function getFeatureEntryPoint(feature) {
  if (!feature || !feature.geometry) {
    return { lat: -15.6083, lng: -56.0645 };
  }

  const props = feature.properties || {};

  // Se tiver porta explicitamente definida
  if (props.porta && props.porta.coordinates) {
    return {
      lat: props.porta.coordinates[1],
      lng: props.porta.coordinates[0]
    };
  }

  const { type, coordinates } = feature.geometry;

  if (type === 'Point') {
    return {
      lat: coordinates[1],
      lng: coordinates[0]
    };
  }

  if (type === 'Polygon') {
    const ring = coordinates[0];
    if (ring && ring.length > 0) {
      let sumLat = 0;
      let sumLng = 0;
      for (const pt of ring) {
        sumLng += pt[0];
        sumLat += pt[1];
      }
      return {
        lat: sumLat / ring.length,
        lng: sumLng / ring.length
      };
    }
  }

  if (type === 'MultiPolygon') {
    const firstPoly = coordinates[0]?.[0];
    if (firstPoly && firstPoly.length > 0) {
      let sumLat = 0;
      let sumLng = 0;
      for (const pt of firstPoly) {
        sumLng += pt[0];
        sumLat += pt[1];
      }
      return {
        lat: sumLat / firstPoly.length,
        lng: sumLng / firstPoly.length
      };
    }
  }

  return { lat: -15.6083, lng: -56.0645 };
}
