import L from 'leaflet';

/**
 * =====================================================================
 * MOTOR DE ESTILOS VISUAIS INDOOR (LEAFLET.JS) - FASE 4
 * =====================================================================
 */

/**
 * 1. POLÍGONOS DE SALAS (poligonos_salas.geojson)
 * Paleta moderna com cores pastel e bordas de alto contraste.
 */
export const SALAS_PALETTE = {
  sala_aula: {
    fillColor: '#BFDBFE', // Azul pastel (Tailwind Blue-200)
    color: '#1D4ED8',     // Azul escuro (Tailwind Blue-700)
    weight: 2,
    fillOpacity: 0.7,
    className: 'geo-sala geo-sala-aula'
  },
  laboratorio: {
    fillColor: '#FEF08A', // Amarelo pastel (Tailwind Yellow-200)
    color: '#B45309',     // Mostarda escuro (Tailwind Amber-700)
    weight: 2,
    fillOpacity: 0.75,
    className: 'geo-sala geo-laboratorio'
  },
  administracao: {
    fillColor: '#E9D5FF', // Roxo claro (Tailwind Purple-200) - Salas PET / Coordenação
    color: '#6B21A8',     // Roxo escuro (Tailwind Purple-800)
    weight: 2,
    fillOpacity: 0.75,
    className: 'geo-sala geo-administracao'
  },
  status_bloqueado: {
    fillColor: '#FEE2E2', // Avermelhado suave com suporte a hachura
    color: '#DC2626',     // Vermelho intenso
    weight: 2.5,
    dashArray: '5, 5',
    fillOpacity: 0.85,
    className: 'geo-sala geo-sala-bloqueada'
  },
  selecionado: {
    fillColor: '#0056b3',
    color: '#1d4ed8',
    weight: 3,
    fillOpacity: 0.8,
    className: 'geo-sala geo-sala-selecionada'
  },
  default: {
    fillColor: '#E2E8F0',
    color: '#64748B',
    weight: 1.5,
    fillOpacity: 0.45,
    className: 'geo-sala geo-default'
  }
};

/**
 * Função de estilo condicional baseada na propriedade feature.properties.tipo_uso
 * @param {GeoJSON.Feature} feature
 * @param {boolean} isSelected
 * @returns {L.PathOptions}
 */
export function getSalaStyle(feature, isSelected = false) {
  if (isSelected) {
    return { ...SALAS_PALETTE.selecionado };
  }

  const props = feature?.properties || {};

  // Validação de bloqueio físico ou administrativo
  const isBloqueado =
    props.status_bloqueado === true ||
    props.bloqueado === true ||
    props.ativo === false ||
    props.tipo_uso === 'status_bloqueado';

  if (isBloqueado) {
    return { ...SALAS_PALETTE.status_bloqueado };
  }

  // Normalização de tipo_uso com fallback para tipo / categoria
  const rawTipo = String(props.tipo_uso || props.tipo || props.categoria || '').toLowerCase().trim();

  if (rawTipo.includes('aula') || rawTipo === 'sala_aula' || rawTipo === 'sala') {
    return { ...SALAS_PALETTE.sala_aula };
  }

  if (rawTipo.includes('lab') || rawTipo === 'laboratorio' || rawTipo === 'laboratório') {
    return { ...SALAS_PALETTE.laboratorio };
  }

  if (
    rawTipo.includes('admin') ||
    rawTipo === 'administracao' ||
    rawTipo === 'administração' ||
    rawTipo.includes('pet') ||
    rawTipo.includes('coordena') ||
    rawTipo.includes('secretaria')
  ) {
    return { ...SALAS_PALETTE.administracao };
  }

  return { ...SALAS_PALETTE.default };
}

/**
 * 2. REDE DE CAMINHOS (rede_caminhos.geojson)
 * Estilos para traçado de rotas calculadas via Dijkstra e corredores base.
 */
export const ROUTE_STYLES = {
  /**
   * Linha da rota ativa gerada pelo algoritmo de menor caminho:
   * Azul neon, espessura de 5px, alta opacidade e animação de traço (dash-array).
   */
  activeDijkstraRoute: {
    color: '#00F0FF',               // Azul Neon
    weight: 5,                      // 5px conforme especificado
    opacity: 1.0,                   // Alta opacidade
    dashArray: '12, 14',            // Espaçamento do traço para fluxo animado
    lineCap: 'round',
    lineJoin: 'round',
    className: 'leaflet-route-neon-active' // Efeito animado e glow no CSS
  },
  corredorBase: {
    color: '#94A3B8',
    weight: 2,
    opacity: 0.35,
    dashArray: '4, 4',
    className: 'leaflet-corredor-base'
  }
};

/**
 * 3. PONTOS DE INTERESSE (pontos_interesse.geojson)
 * Configuração de DivIcon para substituição dos nós:
 * - Elevador (azul)
 * - Escada (laranja)
 * - Bloqueio (ícone de alerta em vermelho)
 */
export const POI_CONFIGS = {
  elevador: {
    className: 'poi-div-icon poi-elevador',
    iconHtml: '<i class="fa-solid fa-elevator"></i>',
    label: 'Elevador'
  },
  escada: {
    className: 'poi-div-icon poi-escada',
    iconHtml: '<i class="fa-solid fa-stairs"></i>',
    label: 'Escada'
  },
  bloqueio: {
    className: 'poi-div-icon poi-bloqueio',
    iconHtml: '<i class="fa-solid fa-triangle-exclamation"></i>',
    label: 'Bloqueio'
  }
};

/**
 * Fábrica de L.divIcon para pontos de interesse
 * @param {GeoJSON.Feature} feature
 * @param {L.LatLng} latlng
 * @returns {L.Marker}
 */
export function createPoiMarker(feature, latlng) {
  const props = feature?.properties || {};
  let tipo = String(props.subtipo || props.tipo || '').toLowerCase().trim();

  const isBloqueado =
    props.status_bloqueado === true ||
    props.bloqueado === true ||
    props.ativo === false ||
    tipo === 'bloqueio';

  if (isBloqueado) {
    tipo = 'bloqueio';
  } else if (tipo.includes('elevador') || tipo.includes('elevator')) {
    tipo = 'elevador';
  } else if (tipo.includes('escada') || tipo.includes('stairs')) {
    tipo = 'escada';
  }

  const config = POI_CONFIGS[tipo] || {
    className: 'poi-div-icon poi-default',
    iconHtml: '<i class="fa-solid fa-location-dot"></i>',
    label: props.nome_amigavel || props.nome || 'Ponto de Interesse'
  };

  const customIcon = L.divIcon({
    className: 'poi-custom-container',
    html: `
      <div class="${config.className}" title="${props.nome_amigavel || props.nome || config.label}">
        <span class="poi-icon-wrapper">${config.iconHtml}</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });

  return L.marker(latlng, { icon: customIcon, draggable: false });
}
