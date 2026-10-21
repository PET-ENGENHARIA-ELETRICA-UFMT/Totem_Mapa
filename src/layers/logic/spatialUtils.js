/**
 * Camada de Lógica: spatialUtils.js
 * Utilitários espaciais puros: distâncias (Haversine), centroides de polígonos,
 * busca de vizinhos com fallback de andar, gerador de instruções turn-by-turn
 * e formatação de nomes legíveis.
 */

export const MAP_CONFIG = {
  bounds: {
    MIN_LON: -56.07384725735446,
    MAX_LON: -56.06187707154574,
    MIN_LAT: -15.61345366988482,
    MAX_LAT: -15.606074048769116
  },
  zoom: {
    INITIAL: 18,
    MIN: 15,
    MAX: 26,
    LABEL_THRESHOLD: 19,
    ROUTE: 21
  },
  colors: {
    floor: {
      '0': '#f1f5f9',
      '1': '#f1f5f9',
      '2': '#f1f5f9'
    },
    selected: '#0056b3',
    default: 'gray',
    route: {
      primary: '#0056b3',
      active: '#0056b3',
      alternative: '#64748b',
      completed: '#93c5fd',
      current: '#f97316'
    }
  },
  navigation: {
    UPDATE_INTERVAL: 1000,
    PROXIMITY_THRESHOLD: 5,
    RECALCULATE_THRESHOLD: 15,
    INSTRUCTION_DISTANCE: 20,
    ARRIVAL_DISTANCE: 3,
    WALKING_SPEED_MPS: 1.2 // metros por segundo
  }
};

/**
 * Calcula a distância geográfica entre dois pares de coordenadas (Fórmula de Haversine em metros)
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distância em metros
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Raio da Terra em metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calcula o centroide geográfico exato de polígonos GeoJSON (Polygon ou MultiPolygon)
 * Utiliza a fórmula de centroide ponderado por área (Teorema de Green / Shoelace),
 * com fallback para média aritmética.
 * @param {Object} geometry - Objeto de geometria GeoJSON
 * @returns {[number, number]} [lon, lat]
 */
export function calculateCentroid(geometry) {
  if (!geometry || !geometry.coordinates) {
    return [-56.0645, -15.6083];
  }

  if (geometry.type === 'Point') {
    return [geometry.coordinates[0], geometry.coordinates[1]];
  }

  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

  if (polygons.length === 0) {
    return [-56.0645, -15.6083];
  }

  let bestCentroid = null;
  let maxArea = -1;

  for (const poly of polygons) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;

    // Translação relativa ao primeiro vértice para evitar cancelamento catastrófico IEEE-754
    const refX = ring[0][0];
    const refY = ring[0][1];

    let area = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < ring.length - 1; i++) {
      const x0 = ring[i][0] - refX;
      const y0 = ring[i][1] - refY;
      const x1 = ring[i + 1][0] - refX;
      const y1 = ring[i + 1][1] - refY;
      const factor = x0 * y1 - x1 * y0;
      area += factor;
      cx += (x0 + x1) * factor;
      cy += (y0 + y1) * factor;
    }

    area = area / 2;
    const absArea = Math.abs(area);

    let centroidPoint;
    if (absArea > 1e-12) {
      centroidPoint = [refX + cx / (6 * area), refY + cy / (6 * area)];
    } else {
      let sx = 0;
      let sy = 0;
      for (const [x, y] of ring) {
        sx += x;
        sy += y;
      }
      centroidPoint = [sx / ring.length, sy / ring.length];
    }

    // Se o centroide cair fora do polígono (ex: polígonos côncavos em L ou U), faz fallback para a média dos vértices
    if (!pointInPolygon(centroidPoint, ring)) {
      let sx = 0;
      let sy = 0;
      const n = ring.length - 1;
      for (let i = 0; i < n; i++) {
        sx += ring[i][0];
        sy += ring[i][1];
      }
      const meanPoint = [sx / n, sy / n];
      if (pointInPolygon(meanPoint, ring)) {
        centroidPoint = meanPoint;
      }
    }

    if (absArea > maxArea) {
      maxArea = absArea;
      bestCentroid = centroidPoint;
    }
  }

  return bestCentroid || [-56.0645, -15.6083];
}

/**
 * Busca o nó do grafo mais próximo de coordenadas dadas com filtro obrigatório por andar,
 * contendo fallback caso não encontre nó no mesmo andar.
 * @param {number} lat 
 * @param {number} lon 
 * @param {string|number} andar 
 * @param {Iterable<Object>|Array<Object>} nodes 
 * @param {boolean} allowFallback 
 * @returns {Object|null} { node, distance }
 */
export function findNearestNode(lat, lon, andar, nodes, allowFallback = true) {
  const nodesArray = Array.isArray(nodes) ? nodes : Array.from(nodes ? nodes.values() : []);
  if (!nodesArray.length) return null;

  const targetFloor = String(andar);
  let nearestOnFloor = null;
  let minDistOnFloor = Infinity;

  let nearestAnyFloor = null;
  let minDistAnyFloor = Infinity;

  for (const node of nodesArray) {
    const d = calculateDistance(lat, lon, node.lat, node.lng);

    if (String(node.andar) === targetFloor) {
      if (d < minDistOnFloor) {
        minDistOnFloor = d;
        nearestOnFloor = node;
      }
    }

    if (d < minDistAnyFloor) {
      minDistAnyFloor = d;
      nearestAnyFloor = node;
    }
  }

  if (nearestOnFloor) {
    return { node: nearestOnFloor, distance: minDistOnFloor };
  }

  if (allowFallback && nearestAnyFloor) {
    return { node: nearestAnyFloor, distance: minDistAnyFloor };
  }

  return null;
}

/**
 * Formata IDs de nós para exibição humana amigável
 * @param {string} rawName 
 * @returns {string}
 */
export function formatLocationName(rawName) {
  if (!rawName) return '';

  const knownNames = {
    entrada_principal_escada_inicio: 'Entrada Principal (Início da Escada)',
    entrada_principal_escada_fim: 'Entrada Principal (Fim da Escada)',
    saida_rodoviaria: 'Saída Rodoviária',
    entrada_rodoviaria: 'Entrada Rodoviária',
    corredor_mofao: 'Corredor Mofão',
    nuvem: 'Bloco Nuvem',
    ponto_corredor_01: 'Ponto Corredor 01',
    ponto_corredor_02: 'Ponto Corredor 02',
    ponto_corredor_03: 'Ponto Corredor 03',
    ponto_corredor_04: 'Ponto Corredor 04',
    ponto_corredor_05: 'Ponto Corredor 05',
    ponto_corredor_06: 'Ponto Corredor 06',
    ponto_corredor_07: 'Ponto Corredor 07',
    ponto_corredor_08: 'Ponto Corredor 08',
    ponto_corredor_09: 'Ponto Corredor 09'
  };

  const lower = String(rawName).trim().toLowerCase();
  if (knownNames[lower]) {
    return knownNames[lower];
  }

  // Remove prefixos internos como "sala_" ou "poi_"
  let clean = rawName.replace(/^(sala_|poi_)/i, '');

  // Substitui underlines por espaços e capitaliza palavras
  return clean
    .split('_')
    .filter(Boolean)
    .map((w) => {
      // Preservar números ou siglas em maiúsculo
      if (/^\d+$/.test(w)) return w;
      if (w.length <= 3 && w.toUpperCase() === w) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/**
 * Helper para nome legível de andar
 * @param {string|number} floor 
 * @returns {string}
 */
export function formatFloorName(floor) {
  const f = String(floor);
  if (f === '0') return 'o térreo';
  return `o ${f}º andar`;
}

/**
 * Gerador de instruções passo a passo (turn-by-turn):
 * - Saída inicial: "Saia de [Origem] e acesse o corredor."
 * - Detecção de transição de andar: identifica mudança de andar na aresta e indica:
 *   "Suba/Desça as escadas para o andar X" ou "Utilize o elevador/rampa para o andar X".
 * - Agrupamento de trechos contínuos: soma as distâncias do mesmo tipo de via ("Siga pelo corredor por 25 m").
 * - Chegada ao destino final.
 * 
 * @param {Array<Object>} path - Lista ordenada de nós que compõem o caminho
 * @param {string} originName - Nome da origem
 * @param {string} destinationName - Nome do destino
 * @returns {Array<Object>} Lista de instruções formatadas
 */
export function generateTurnByTurnInstructions(path, originName = '', destinationName = '') {
  if (!path || path.length === 0) return [];

  const instructions = [];
  const firstNode = path[0];
  const lastNode = path[path.length - 1];

  const resolvedOrigin = originName || firstNode.nome || 'sua localização';
  const resolvedDestination = destinationName || lastNode.nome || 'Destino';

  let stepNumber = 1;

  // 1. Saída inicial
  const isOriginRoom = firstNode.isRoom || firstNode.tipo === 'sala' || firstNode.tipo === 'laboratório';
  let startIndex = 0;

  if (isOriginRoom && path.length > 1) {
    const exitDist = calculateDistance(firstNode.lat, firstNode.lng, path[1].lat, path[1].lng);
    instructions.push({
      step: stepNumber++,
      instruction: `Saia de ${resolvedOrigin} e acesse o corredor.`,
      distance: Math.round(exitDist),
      tipo: 'saida',
      icon: 'fa-solid fa-door-open',
      andar: firstNode.andar,
      node: firstNode
    });
    startIndex = 1;
  }

  // 2. Iterar pelos nós agrupando trechos contínuos e detectando transições verticais
  let accumulatedDist = 0;
  let currentGroupType = null;
  let currentGroupFloor = null;

  function flushGroup() {
    if (accumulatedDist > 0 && currentGroupType) {
      const roundedDist = Math.max(1, Math.round(accumulatedDist));
      let text = `Siga pelo corredor por ${roundedDist} metros.`;
      let icon = 'fa-solid fa-person-walking';

      if (currentGroupType === 'rampa') {
        text = `Siga pela rampa por ${roundedDist} metros.`;
        icon = 'fa-solid fa-wheelchair';
      }

      instructions.push({
        step: stepNumber++,
        instruction: text,
        distance: roundedDist,
        tipo: currentGroupType,
        icon,
        andar: currentGroupFloor
      });

      accumulatedDist = 0;
      currentGroupType = null;
    }
  }

  for (let i = startIndex; i < path.length - 1; i++) {
    const curr = path[i];
    const next = path[i + 1];

    // Se o próximo nó for a sala de destino final
    const isNextDestinationRoom = i + 1 === path.length - 1 && (next.isRoom || next.tipo === 'sala' || next.tipo === 'laboratório');
    if (isNextDestinationRoom) {
      const enterDist = calculateDistance(curr.lat, curr.lng, next.lat, next.lng);
      accumulatedDist += enterDist;
      if (!currentGroupType) currentGroupType = 'corredor';
      if (!currentGroupFloor) currentGroupFloor = curr.andar;
      flushGroup();
      break;
    }

    const segmentDist = calculateDistance(curr.lat, curr.lng, next.lat, next.lng);
    const edgeType = (next.tipo || curr.tipo || 'corredor').toLowerCase();
    const isFloorChange = String(curr.andar) !== String(next.andar);

    // Detectar transição de andar ou elemento vertical
    if (isFloorChange || edgeType === 'escada' || edgeType === 'elevador' || edgeType === 'rampa') {
      flushGroup();

      const targetFloorName = formatFloorName(next.andar);
      const isGoingUp = Number(next.andar) > Number(curr.andar);
      let transText = '';
      let transIcon = 'fa-solid fa-stairs';
      let transType = edgeType;

      if (edgeType === 'elevador') {
        transText = `Utilize o elevador para ${targetFloorName}.`;
        transIcon = 'fa-solid fa-elevator';
        transType = 'elevador';
      } else if (edgeType === 'rampa') {
        transText = isFloorChange
          ? `Utilize a rampa para ${targetFloorName}.`
          : `Siga pela rampa por ${Math.max(1, Math.round(segmentDist))} metros.`;
        transIcon = 'fa-solid fa-wheelchair';
        transType = 'rampa';
      } else {
        // Escada
        transText = isFloorChange
          ? `${isGoingUp ? 'Suba' : 'Desça'} as escadas para ${targetFloorName}.`
          : `Suba/desça as escadas por ${Math.max(1, Math.round(segmentDist))} metros.`;
        transIcon = 'fa-solid fa-stairs';
        transType = 'escada';
      }

      instructions.push({
        step: stepNumber++,
        instruction: transText,
        distance: Math.max(1, Math.round(segmentDist)),
        tipo: transType,
        icon: transIcon,
        andar: next.andar,
        node: next
      });
    } else {
      // Trecho horizontal contínuo (corredor)
      if (currentGroupType === edgeType && currentGroupFloor === curr.andar) {
        accumulatedDist += segmentDist;
      } else {
        flushGroup();
        currentGroupType = edgeType;
        currentGroupFloor = curr.andar;
        accumulatedDist = segmentDist;
      }
    }
  }

  flushGroup();

  // 3. Chegada ao destino final
  instructions.push({
    step: stepNumber,
    instruction: `Você chegou ao destino: ${resolvedDestination}.`,
    distance: 0,
    tipo: 'chegada',
    icon: 'fa-solid fa-location-dot',
    andar: lastNode.andar,
    node: lastNode
  });

  return instructions;
}

/**
 * Calcula o azimute (bearing) entre duas coordenadas em graus (0 a 360)
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);

  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Converte azimute em direção cardeal descritiva
 */
export function bearingToDirection(bearing) {
  const directions = [
    'norte',
    'nordeste',
    'leste',
    'sudeste',
    'sul',
    'sudoeste',
    'oeste',
    'noroeste'
  ];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

/**
 * Determina o tipo de curva baseado na variação angular
 */
export function getTurnType(angle) {
  const absAngle = Math.abs(angle);
  if (absAngle < 20) return 'siga em frente';
  if (absAngle < 60) return angle > 0 ? 'vire levemente à direita' : 'vire levemente à esquerda';
  if (absAngle < 120) return angle > 0 ? 'vire à direita' : 'vire à esquerda';
  return angle > 0 ? 'vire fortemente à direita' : 'vire fortemente à esquerda';
}

/**
 * Abrevia nomes longos de salas para exibição em labels compactas
 */
export function abbreviateName(name, maxLength = 15) {
  if (!name || name.length <= maxLength) return name;

  const parts = name.split(' ');
  if (parts.length === 1) {
    return name.substring(0, maxLength) + '...';
  }

  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const abbreviated = parts[i].substring(0, 3);
    if ((result + ' ' + abbreviated).length > maxLength) break;
    result += ' ' + abbreviated;
  }
  return result;
}

/**
 * Retorna as coordenadas do centro médio padrão do campus
 */
export function getMapCenter() {
  const centerLat = (MAP_CONFIG.bounds.MIN_LAT + MAP_CONFIG.bounds.MAX_LAT) / 2;
  const centerLon = (MAP_CONFIG.bounds.MIN_LON + MAP_CONFIG.bounds.MAX_LON) / 2;
  return [centerLat, centerLon];
}

/**
 * Função utilitária de debounce
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Calcula projeção ortogonal de ponto (px, py) no segmento (x1, y1)-(x2, y2)
 */
export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { d2: (px - x1) ** 2 + (py - y1) ** 2, t: 0, proj: [x1, y1] };
  let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return { d2: (px - projX) ** 2 + (py - projY) ** 2, t, proj: [projX, projY] };
}

/**
 * Determina se dois segmentos de reta 2D se intersectam
 */
export function segmentsIntersect(a1, a2, b1, b2) {
  function ccw(p1, p2, p3) {
    return (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0]);
  }
  return (ccw(a1, b1, b2) !== ccw(a2, b1, b2)) && (ccw(a1, a2, b1) !== ccw(a1, a2, b2));
}

export const SNAPPING_THRESHOLD_METERS = 8.0;

/**
 * Verifica se um segmento de reta corta as bordas ou interior de um polígono
 */
export function segmentCrossesPolygon(p1, p2, ring) {
  return segmentIntersectsPolygonInterior(p1, p2, ring);
}

/**
 * Verifica se um ponto 2D [lon, lat] está estritamente contido no interior de um anel de polígono
 * Algoritmo clássico de Ray-Casting (Even-Odd rule)
 * @param {[number, number]} point [lon, lat]
 * @param {Array<[number, number]>} ring Anel de coordenadas [[lon, lat], ...]
 * @returns {boolean}
 */
export function pointInPolygon(point, ring) {
  if (!ring || ring.length < 3) return false;
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Determina se um segmento de reta entre p1 e p2 cruza as bordas ou o interior de um polígono
 * @param {[number, number]} p1 [lon, lat]
 * @param {[number, number]} p2 [lon, lat]
 * @param {Array<[number, number]>} ring
 * @returns {boolean}
 */
export function segmentIntersectsPolygonInterior(p1, p2, ring) {
  if (!ring || ring.length < 3) return false;
  // 1. Verifica cruzamento de arestas
  for (let i = 0; i < ring.length - 1; i++) {
    if (segmentsIntersect(p1, p2, ring[i], ring[i + 1])) {
      return true;
    }
  }
  // 2. Verifica se o ponto médio do segmento está dentro do polígono
  const midPoint = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  if (pointInPolygon(midPoint, ring)) {
    return true;
  }
  return false;
}

/**
 * Valida se um segmento de reta corta qualquer sala do andar especificado
 * @param {[number, number]} p1 
 * @param {[number, number]} p2 
 * @param {Array<Object>} salasFeatures 
 * @param {string|number} floor 
 * @param {number|null} ignoreIdx Índice da sala de origem/destino a ignorar se aplicável
 * @returns {boolean} True se cortar alguma sala indevida
 */
export function segmentCrossesAnyRoom(p1, p2, salasFeatures, floor, ignoreIdx = null) {
  if (!salasFeatures || !salasFeatures.length) return false;
  const floorStr = String(floor);

  for (let i = 0; i < salasFeatures.length; i++) {
    if (ignoreIdx !== null && i === ignoreIdx) continue;
    const feat = salasFeatures[i];
    if (String(feat.properties?.andar ?? 0) !== floorStr) continue;

    const ring =
      feat.geometry?.type === 'Polygon'
        ? feat.geometry.coordinates[0]
        : feat.geometry?.type === 'MultiPolygon'
        ? feat.geometry.coordinates[0]?.[0]
        : null;

    if (segmentIntersectsPolygonInterior(p1, p2, ring)) {
      return true;
    }
  }
  return false;
}

