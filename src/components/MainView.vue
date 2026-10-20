<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMainStore } from '../stores/mainStore.js';
import { MAP_CONFIG, abbreviateName, getMapCenter } from '../layers/logic/utils.js';
import { TILE_PROVIDERS } from '../layers/data/tileProviders.js';
import { getSalaStyle, createPoiMarker, ROUTE_STYLES } from '../layers/logic/indoorStyleEngine.js';

const store = useMainStore();

let map = null;
let currentTileLayer = null;
const currentZoom = ref(MAP_CONFIG.zoom.INITIAL);
const mapLayers = {
  floor: null,
  salas: null,
  pontos: null,
  labels: null,
  activeRoute: null,
  completedRoute: null,
  alternativeRoutes: null,
  originMarker: null,
  destinationMarker: null,
  userMarker: null
};

// Elevador (ou POI) marcado como desativado no GeoJSON (ativo: false)
function isFeatureDisabled(feature) {
  const v = feature?.properties?.ativo;
  return v === false || String(v).toLowerCase() === 'false';
}

// Ícones Customizados Leaflet
function getPoiIcon(tipo, disabled = false) {
  const t = (tipo || '').toLowerCase();
  const iconMap = {
    banheiro: { html: '🚻', className: 'poi-marker poi-marker-banheiro', size: [28, 28] },
    elevador: { html: '🛗', className: 'poi-marker poi-marker-elevador', size: [28, 28] },
    rampa: { html: '♿', className: 'poi-marker poi-marker-rampa', size: [28, 28] },
    escada: { html: '🪜', className: 'poi-marker poi-marker-escada', size: [28, 28] },
    totem: { html: 'ℹ️', className: 'poi-marker poi-marker-totem', size: [32, 32] }
  };

  const item = iconMap[t] || { html: '📍', className: 'poi-marker', size: [28, 28] };
  return L.divIcon({
    className: disabled ? `${item.className} poi-marker-disabled` : item.className,
    html: item.html,
    iconSize: item.size,
    iconAnchor: [item.size[0] / 2, item.size[1]],
    popupAnchor: [0, -item.size[1]]
  });
}

function getUserLocationIcon() {
  return L.divIcon({
    className: 'user-location-marker',
    html: '📍',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
}

function getEndpointIcon(type) {
  const isOrigin = type === 'origin';
  return L.divIcon({
    className: `route-endpoint-marker ${isOrigin ? 'endpoint-origin' : 'endpoint-dest'}`,
    html: `<div style="background: ${isOrigin ? '#2563eb' : '#e11d48'}; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2.5px solid white;"><i class="fa-solid ${isOrigin ? 'fa-flag' : 'fa-location-dot'}"></i></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28]
  });
}

function getElevatorTransitionIcon() {
  return L.divIcon({
    className: 'elevator-transition-marker',
    html: `
      <div class="relative flex items-center justify-center cursor-pointer">
        <span class="animate-ping absolute inline-flex h-9 w-9 rounded-full bg-amber-400 opacity-60"></span>
        <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 900; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5); border: 2.5px solid white;">
          <i class="fa-solid fa-elevator"></i>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

// Aplicação dinâmica de camada base de tiles ("tyler")
function applyTileLayer(providerId) {
  if (!map) return;
  const provider = TILE_PROVIDERS[providerId] || TILE_PROVIDERS['carto-positron'];

  if (currentTileLayer && map.hasLayer(currentTileLayer)) {
    map.removeLayer(currentTileLayer);
    currentTileLayer = null;
  }

  const effectiveMaxZoom = store.maxZoomLevel || MAP_CONFIG.zoom.MAX;

  currentTileLayer = L.tileLayer(provider.url, {
    attribution: provider.attribution,
    subdomains: provider.subdomains || 'abc',
    maxNativeZoom: provider.maxNativeZoom || 19,
    maxZoom: effectiveMaxZoom,
    crossOrigin: true
  }).addTo(map);

  currentTileLayer.bringToBack();
  if (mapLayers.floor) {
    mapLayers.floor.bringToBack();
    currentTileLayer.bringToBack();
  }
}

// Inicialização do Mapa
function initMap() {
  const center = getMapCenter();
  const effectiveMinZoom = MAP_CONFIG.zoom.MIN || 15;
  const effectiveMaxZoom = store.maxZoomLevel || MAP_CONFIG.zoom.MAX;

  map = L.map('map-container', {
    center,
    zoom: MAP_CONFIG.zoom.INITIAL,
    minZoom: effectiveMinZoom,
    maxZoom: effectiveMaxZoom,
    zoomControl: false
  });

  // Camada base dinâmica com suporte a super zoom
  applyTileLayer(store.selectedTileProvider);

  map.on('click', () => {
    if (store.selectedRoom && !store.navigation.isActive) {
      store.clearRoomSelection();
    }
  });

  map.on('zoomend moveend', () => {
    currentZoom.value = map.getZoom();
    updateZoomDependentLayers();
  });

  // Render inicial caso dados já existam
  if (store.isReady) {
    renderFloorView();
  }
}

// Remover camada auxiliar
function removeLayer(name) {
  if (mapLayers[name] && map && map.hasLayer(mapLayers[name])) {
    map.removeLayer(mapLayers[name]);
    mapLayers[name] = null;
  }
}

// Renderizar Polígonos de Andar (Planta Baixa arquitetural - base não selecionável)
function drawFloor() {
  removeLayer('floor');
  if (!map || !store.geoData.floor) return;

  const features = store.geoData.floor.features.filter(
    (f) => String(f.properties?.andar) === String(store.currentFloor)
  );

  if (features.length === 0) return;

  const slabOpacity =
    store.floorOpacity !== undefined
      ? store.floorOpacity
      : store.isDarkMode
      ? 0.6
      : 0.85;

  mapLayers.floor = L.geoJson(features, {
    className: 'floor-slab-background',
    style: () => ({
      fillColor: store.isDarkMode ? '#1e293b' : '#f1f5f9',
      color: store.isDarkMode ? '#334155' : '#cbd5e1',
      weight: 1.5,
      fillOpacity: slabOpacity
    }),
    interactive: false
  }).addTo(map);

  mapLayers.floor.bringToBack();
  if (currentTileLayer) {
    currentTileLayer.bringToBack();
  }
}

// Renderizar Polígonos das Salas
function drawSalas() {
  removeLayer('salas');
  if (!map || !store.geoData.salas) return;

  const currentSelectedName = store.selectedRoomFeature?.properties?.nome;

  const features = store.geoData.salas.features.filter(
    (f) => String(f.properties?.andar) === String(store.currentFloor)
  );

  if (features.length === 0) return;

  mapLayers.salas = L.geoJson(
    { ...store.geoData.salas, features },
    {
      style: (feature) => {
        const isSelected = feature.properties?.nome === currentSelectedName;
        const baseStyle = getSalaStyle(feature, isSelected);
        return {
          ...baseStyle,
          className: `${baseStyle.className || 'geo-sala'} sala-polygon-interactive`
        };
      },
      onEachFeature: (feature, layer) => {
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          store.selectRoom(feature, false);

          const props = feature.properties || {};
          const popupContent = createPopupContent(props);

          L.popup({ minWidth: 260 })
            .setLatLng(e.latlng)
            .setContent(popupContent)
            .openOn(map);

          setTimeout(() => {
            const btnMain = document.getElementById('popup-btn-main-action');
            if (btnMain) {
              btnMain.onclick = () => {
                if (store.originNodeId) {
                  store.setAsDestination(props.nome);
                } else {
                  store.setAsOrigin(props.nome);
                }
                map.closePopup();
              };
            }
            const btnSec = document.getElementById('popup-btn-secondary-action');
            if (btnSec) {
              btnSec.onclick = () => {
                store.setAsOrigin(props.nome);
                map.closePopup();
              };
            }
          }, 50);
        });
      }
    }
  ).addTo(map);
}

function createPopupContent(props) {
  const andarText = props.andar === 0 || props.andar === '0' ? 'Térreo' : `${props.andar}º Andar`;
  const sanitizedName = props.nome || 'Local';
  const hasOrigin = Boolean(store.originNodeId);

  return `
    <div class="custom-popup">
      <img src="${props.imagem || 'https://placehold.co/400x200/eeeeee/cccccc?text=Sem+Imagem'}" 
           alt="${sanitizedName}" 
           class="popup-image" 
           onerror="this.src='https://placehold.co/400x200/eeeeee/cccccc?text=Erro'">
      <div class="popup-content">
        <div class="popup-header">${sanitizedName}</div>
        <div class="popup-details">
          <b>Bloco:</b> ${(props.bloco || 'FAET').toUpperCase()}<br>
          <b>Andar:</b> ${andarText}<br>
          <b>Tipo:</b> ${props.tipo || 'Sala'}
        </div>
        <div class="popup-actions" style="display: flex; flex-direction: column; gap: 8px;">
          <button id="popup-btn-main-action" class="popup-button">
            ${hasOrigin ? 'Definir Chegada' : 'Definir Partida'}
          </button>
          ${hasOrigin ? `
            <button id="popup-btn-secondary-action" class="popup-button popup-button-secondary">
              Definir Partida
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// Renderizar Pontos de Interesse (POIs)
function drawPontos() {
  removeLayer('pontos');
  if (!map || !store.geoData.pontos) return;

  const currentZoom = map.getZoom();
  if (!store.layersVisible || currentZoom < MAP_CONFIG.zoom.LABEL_THRESHOLD) {
    return;
  }

  const features = store.geoData.pontos.features.filter(
    (f) => String(f.properties?.andar) === String(store.currentFloor)
  );

  if (features.length === 0) return;

  mapLayers.pontos = L.geoJson(
    { ...store.geoData.pontos, features },
    {
      pointToLayer: (feature, latlng) => {
        return createPoiMarker(feature, latlng);
      },
      onEachFeature: (feature, layer) => {
        if (isFeatureDisabled(feature)) {
          layer.bindPopup(
            `<b>${feature.properties?.nome || 'Elevador'}</b><br>` +
              `<span style="color:#dc2626;font-weight:800">⚠️ Desativado — este elevador não está funcionando no momento.</span>`
          );
        } else if (feature.properties?.nome) {
          layer.bindPopup(`<b>${feature.properties.nome}</b>`);
        }
      }
    }
  ).addTo(map);
}

// Renderizar Rótulos das Salas
function drawLabels() {
  removeLayer('labels');
  if (!map || !store.geoData.salas) return;

  const currentZoom = map.getZoom();
  if (!store.layersVisible || currentZoom < MAP_CONFIG.zoom.LABEL_THRESHOLD) {
    return;
  }

  mapLayers.labels = L.layerGroup();

  const features = store.geoData.salas.features.filter(
    (f) => String(f.properties?.andar) === String(store.currentFloor)
  );

  features.forEach((feature) => {
    if (feature.properties?.nome) {
      const geoLayer = L.geoJson(feature);
      const center = geoLayer.getBounds().getCenter();
      const labelText = abbreviateName(feature.properties.nome);

      const label = L.marker(center, {
        icon: L.divIcon({
          className: 'sala-label',
          html: labelText,
          iconSize: [100, 20],
          iconAnchor: [50, 10]
        }),
        interactive: false
      });

      mapLayers.labels.addLayer(label);
    }
  });

  mapLayers.labels.addTo(map);
}

function updateZoomDependentLayers() {
  drawLabels();
  drawPontos();
}

function renderFloorView() {
  clearRouteDrawings();
  drawFloor();
  drawSalas();
  updateZoomDependentLayers();
}

function clearRouteDrawings() {
  removeLayer('activeRoute');
  removeLayer('completedRoute');
  removeLayer('alternativeRoutes');
  removeLayer('originMarker');
  removeLayer('destinationMarker');
  removeLayer('userMarker');
}

// Desenhar Rota no Mapa apenas para o Andar Correspondente
function drawNavigationRoute() {
  clearRouteDrawings();
  if (!map || !store.navigation.isActive || store.navigation.route.length === 0) {
    return;
  }

  const route = store.navigation.route;
  const currentIdx = store.navigation.currentSegmentIndex;
  const currentFloorStr = String(store.currentFloor);

  // Filtro estrito: desenhar apenas os nós que pertencem ao andar correspondente
  const floorNodes = route.filter((n) => String(n.andar) === currentFloorStr);

  if (floorNodes.length === 0) {
    return;
  }

  // 1. Desenhar rotas alternativas no andar correspondente (se existirem)
  if (store.routes && store.routes.length > 1) {
    mapLayers.alternativeRoutes = L.layerGroup();
    store.routes.forEach((altRoute, altIdx) => {
      if (altIdx === store.selectedRouteIndex) return;
      const altFloorNodes = altRoute.nodes.filter((n) => String(n.andar) === currentFloorStr);
      if (altFloorNodes.length < 2) return;

      const altCoords = altFloorNodes.map((n) => [n.lat, n.lng]);
      const altPolyline = L.polyline(altCoords, {
        color: '#94a3b8',
        weight: 5,
        dashArray: '6, 8',
        opacity: 0.65
      });
      altPolyline.bindTooltip(`Alternativa ${altIdx}: ${altRoute.totalDistance}m (clique para alternar)`, {
        sticky: true
      });
      altPolyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        store.selectRoute(altIdx);
      });
      mapLayers.alternativeRoutes.addLayer(altPolyline);
    });
    mapLayers.alternativeRoutes.addTo(map);
  }

  // 2. Traçado da rota no andar correspondente (Azul Neon animado)
  if (floorNodes.length >= 2) {
    const floorCoords = floorNodes.map((n) => [n.lat, n.lng]);
    mapLayers.activeRoute = L.polyline(floorCoords, ROUTE_STYLES.activeDijkstraRoute).addTo(map);
  }

  // 3. Marcador de Ponto de Partida
  const startNode = route[0];
  if (startNode && String(startNode.andar) === currentFloorStr) {
    mapLayers.originMarker = L.marker([startNode.lat, startNode.lng], {
      icon: getEndpointIcon('origin'),
      zIndexOffset: 900
    }).addTo(map);
    mapLayers.originMarker.bindTooltip(`<b>Partida:</b> ${startNode.nome}`, { permanent: false });
  }

  // 4. Marcador de Destino / Elevador de Transição
  const endNode = route[route.length - 1];
  const isFloorTransitionElevator =
    store.floorTransition?.active &&
    String(endNode?.andar) === currentFloorStr &&
    (endNode?.isElevator || endNode?.tipo === 'elevador');

  if (isFloorTransitionElevator) {
    // Marcador especial de transição por elevador
    mapLayers.destinationMarker = L.marker([endNode.lat, endNode.lng], {
      icon: getElevatorTransitionIcon(),
      zIndexOffset: 980
    }).addTo(map);

    const destFloorName = store.floorTransition.destinationFloorName;
    const popupContent = `
      <div class="custom-popup" style="min-width: 200px;">
        <div class="popup-content">
          <div class="popup-header flex items-center gap-2">
            <span>🛗</span> ${endNode.nome}
          </div>
          <div class="popup-details">
            <b>Mudança de Andar Necessária:</b><br/>
            Suba/desça pelo elevador para chegar ao <b>${destFloorName}</b>.
          </div>
          <button id="btn-popup-switch-floor" class="popup-button mt-2">
            Mudar para o ${destFloorName}
          </button>
        </div>
      </div>
    `;

    mapLayers.destinationMarker.bindPopup(popupContent);
    mapLayers.destinationMarker.on('popupopen', () => {
      setTimeout(() => {
        const btn = document.getElementById('btn-popup-switch-floor');
        if (btn) {
          btn.onclick = () => {
            store.continueRouteOnDestinationFloor();
            map.closePopup();
          };
        }
      }, 50);
    });
  } else if (endNode && endNode !== startNode && String(endNode.andar) === currentFloorStr) {
    mapLayers.destinationMarker = L.marker([endNode.lat, endNode.lng], {
      icon: getEndpointIcon('destination'),
      zIndexOffset: 950
    }).addTo(map);
    mapLayers.destinationMarker.bindTooltip(`<b>Destino:</b> ${endNode.nome}`, { permanent: false });
  }

  // 5. Marcador de posição atual do usuário / segmento ativo
  const currentNode = route[currentIdx] || route[0];
  if (currentNode && String(currentNode.andar) === currentFloorStr) {
    mapLayers.userMarker = L.marker([currentNode.lat, currentNode.lng], {
      icon: getUserLocationIcon(),
      zIndexOffset: 1000
    }).addTo(map);
  }

  // 6. Ajustar enquadramento geral no andar atual
  if (floorNodes.length >= 2) {
    const floorCoords = floorNodes.map((n) => [n.lat, n.lng]);
    map.fitBounds(L.polyline(floorCoords).getBounds(), { padding: [80, 80], maxZoom: 22 });
  }
}

// Watchers reativos
watch(
  () => store.isReady,
  (ready) => {
    if (ready) renderFloorView();
  }
);

watch(
  () => store.currentFloor,
  () => {
    renderFloorView();
    if (store.navigation.isActive) {
      drawNavigationRoute();
    }
  }
);

watch(
  () => store.selectedRoom,
  () => {
    drawSalas();
  }
);

watch(
  () => store.layersVisible,
  () => {
    updateZoomDependentLayers();
  }
);

watch(
  () => [store.navigation.isActive, store.navigation.currentSegmentIndex, store.navigation.route],
  () => {
    if (store.navigation.isActive) {
      drawNavigationRoute();
    } else {
      clearRouteDrawings();
      drawSalas();
    }
  },
  { deep: true }
);

watch(
  () => store.mapCenterRequest,
  (req) => {
    if (!req || !map) return;
    if (req.feature) {
      const bounds = L.geoJson(req.feature).getBounds();
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: MAP_CONFIG.zoom.ROUTE });
    } else if (req.lat && req.lng) {
      map.setView([req.lat, req.lng], req.zoom || map.getZoom());
    }
  }
);

watch(
  () => store.selectedTileProvider,
  (newProvider) => {
    applyTileLayer(newProvider);
  }
);

watch(
  () => store.maxZoomLevel,
  (newMaxZoom) => {
    if (map) {
      map.setMaxZoom(newMaxZoom);
      if (currentTileLayer) {
        currentTileLayer.options.maxZoom = newMaxZoom;
      }
    }
  }
);

watch(
  () => store.floorOpacity,
  () => {
    drawFloor();
  }
);

watch(
  () => store.isDarkMode,
  () => {
    drawFloor();
  }
);

// Controles Interativos
function zoomIn() {
  if (map) {
    const max = store.maxZoomLevel || MAP_CONFIG.zoom.MAX;
    if (map.getZoom() < max) {
      map.zoomIn();
    } else {
      store.showNotification(`Zoom máximo atingido (${max}x)`, 'info');
    }
  }
}

function zoomOut() {
  if (map) map.zoomOut();
}

function locateUser() {
  if (navigator.geolocation && map) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        map.setView([lat, lng], MAP_CONFIG.zoom.ROUTE);

        if (mapLayers.userMarker) {
          mapLayers.userMarker.setLatLng([lat, lng]);
        } else {
          mapLayers.userMarker = L.marker([lat, lng], {
            icon: getUserLocationIcon(),
            zIndexOffset: 1000
          }).addTo(map);
        }
        store.showNotification('Posição localizada com sucesso!', 'success');
      },
      () => {
        store.showNotification('Não foi possível obter geolocalização.', 'error');
      }
    );
  }
}

onMounted(() => {
  initMap();
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<template>
  <main class="w-full h-screen absolute inset-0 z-0">
    <!-- Definição da Hachura SVG para salas bloqueadas -->
    <svg width="0" height="0" class="absolute pointer-events-none">
      <defs>
        <pattern
          id="diagonal-hatch-red"
          width="8"
          height="8"
          patternTransform="rotate(45 0 0)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="8" stroke="#DC2626" stroke-width="2.5" />
        </pattern>
      </defs>
    </svg>

    <!-- Container do Mapa Leaflet -->
    <div
      id="map-container"
      :class="['w-full h-full', { 'high-zoom-crisp': store.tileSharpness }]"
    ></div>

    <!-- BANNER FLUTUANTE DE TRANSIÇÃO DE ANDAR (CENTRO TOPO) -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-4"
    >
      <div
        v-if="store.floorTransition?.active"
        id="map-floor-transition-banner"
        class="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto max-w-xl px-4"
      >
        <div
          class="bg-gradient-to-r from-amber-600/95 via-amber-700/95 to-blue-700/95 text-white backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl border border-white/20 flex flex-wrap items-center justify-between gap-3 text-xs font-bold"
        >
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg bg-amber-400 text-amber-950 flex items-center justify-center font-black text-sm shrink-0">
              <i class="fa-solid fa-elevator"></i>
            </span>
            <span class="leading-tight">
              Mudança de Andar: Siga até o <b>{{ store.floorTransition.elevatorName }}</b> para ir ao <b>{{ store.floorTransition.destinationFloorName }}</b>
            </span>
          </div>
          <button
            type="button"
            @click="store.continueRouteOnDestinationFloor()"
            class="bg-white hover:bg-amber-50 text-amber-950 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95 shrink-0"
          >
            Mudar para o {{ store.floorTransition.destinationFloorName }} →
          </button>
        </div>
      </div>
    </Transition>

    <!-- CONTROLES DO MAPA (centro direita: Zoom e Seletor de Andares) -->
    <div
      class="absolute right-2.5 sm:right-3 md:right-4 top-1/2 -translate-y-1/2 z-[1000] flex flex-col items-center gap-0.5 sm:gap-1 bg-[#1a1f2e]/90 dark:bg-[#0d1117]/95 text-white backdrop-blur-md p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-white/10 shadow-2xl pointer-events-auto transition-all"
    >
      <!-- Zoom In -->
      <button
        id="btn-zoom-in"
        type="button"
        title="Aumentar Zoom"
        @click="zoomIn"
        class="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-lg sm:rounded-xl hover:bg-white/10 flex items-center justify-center text-xs sm:text-sm md:text-base font-black transition-all active:scale-90"
      >
        <i class="fa-solid fa-plus"></i>
      </button>

      <!-- Zoom Level Indicator -->
      <div
        id="zoom-indicator-badge"
        class="text-[8px] sm:text-[9px] font-black tracking-tighter text-slate-300 select-none py-0.5 text-center"
        title="Nível de Zoom Atual"
      >
        {{ currentZoom }}x
      </div>

      <div class="w-6 sm:w-8 h-[1px] bg-white/10 my-0.5"></div>

      <!-- Floor Selector Stack -->
      <button
        id="btn-floor-2"
        type="button"
        @click="store.setFloor('2')"
        :class="[
          'floor-btn w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-lg sm:rounded-xl font-black flex items-center justify-center text-[10px] sm:text-xs transition-all active:scale-90',
          store.currentFloor === '2'
            ? 'bg-blue-600 shadow-lg shadow-blue-600/30 text-white active-floor'
            : 'hover:bg-white/10'
        ]"
      >
        2
      </button>

      <button
        id="btn-floor-1"
        type="button"
        @click="store.setFloor('1')"
        :class="[
          'floor-btn w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-lg sm:rounded-xl font-black flex items-center justify-center text-[10px] sm:text-xs transition-all active:scale-90',
          store.currentFloor === '1'
            ? 'bg-blue-600 shadow-lg shadow-blue-600/30 text-white active-floor'
            : 'hover:bg-white/10'
        ]"
      >
        1
      </button>

      <button
        id="btn-floor-0"
        type="button"
        @click="store.setFloor('0')"
        :class="[
          'floor-btn w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-lg sm:rounded-xl font-black flex items-center justify-center text-[10px] sm:text-xs transition-all active:scale-90',
          store.currentFloor === '0'
            ? 'bg-blue-600 shadow-lg shadow-blue-600/30 text-white active-floor'
            : 'hover:bg-white/10'
        ]"
      >
        T
      </button>

      <div class="w-6 sm:w-8 h-[1px] bg-white/10 my-0.5"></div>

      <!-- Zoom Out -->
      <button
        id="btn-zoom-out"
        type="button"
        title="Diminuir Zoom"
        @click="zoomOut"
        class="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-lg sm:rounded-xl hover:bg-white/10 flex items-center justify-center text-xs sm:text-sm md:text-base font-black transition-all active:scale-90"
      >
        <i class="fa-solid fa-minus"></i>
      </button>
    </div>

    <!-- CARD DO RODAPÉ ESQUERDO: Preservado rigorosamente no Desktop, Oculto no Mobile -->
    <div
      id="card-totem-info"
      class="hidden md:block absolute bottom-6 left-6 z-[1000] pointer-events-auto"
    >
      <div
        class="bg-white/95 dark:bg-[#1a1f2e]/95 backdrop-blur-xl shadow-2xl rounded-3xl p-4 border border-white/60 dark:border-white/10 flex items-center gap-4 hover:-translate-y-1 transition-all duration-300"
      >
        <!-- QR Code Container: oculto em telas menores -->
        <div
          class="hidden md:flex qr-code-wrapper w-16 h-16 bg-white rounded-2xl p-1.5 shadow-md items-center justify-center border border-slate-100 dark:border-slate-800 flex-shrink-0"
        >
          <img
            src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://github.com/PET-Eletrica-UFMT/"
            alt="QR Code Rota"
            class="w-full h-full rounded-xl mix-blend-multiply opacity-90"
          />
        </div>
        <!-- Info Text -->
        <div class="pr-2 flex flex-col justify-center">
          <span
            class="text-sm font-extrabold text-slate-800 dark:text-white leading-tight tracking-tight"
          >
            AcessoMap FAET
          </span>
          <span class="text-[10px] font-bold text-slate-400 mt-0.5">
            powered by PET Elétrica - UFMT
          </span>
          <span
            class="text-[9px] font-extrabold text-blue-600 dark:text-blue-400 mt-1 uppercase tracking-wider"
          >
            Mapas FAET — 2025
          </span>
        </div>
      </div>
    </div>

    <!-- BARRA DE NAVEGAÇÃO EM TEMPO REAL: Adaptada para portrait e landscape -->
    <div
      v-if="store.navigation.isActive && store.currentInstruction"
      id="navigation-bar"
      class="absolute bottom-16 sm:bottom-18 md:bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-[calc(100vw-1.5rem)] sm:max-w-xl md:max-w-2xl px-2 sm:px-4 pointer-events-auto max-md:landscape:bottom-2 max-md:landscape:left-14 max-md:landscape:translate-x-0 max-md:landscape:max-w-[50vw]"
    >
      <div
        class="bg-[#1a1f2e]/95 dark:bg-[#0d1117]/95 text-white backdrop-blur-xl shadow-2xl rounded-2xl md:rounded-3xl p-2.5 sm:p-3 md:p-4 border border-white/10 flex items-center justify-between gap-2.5 md:gap-4 transition-all duration-300"
      >
        <!-- Left: Icon + Instruction -->
        <div class="flex items-center gap-2.5 md:gap-4 min-w-0">
          <div
            class="bg-blue-600 text-white p-2 sm:p-2.5 md:p-3 rounded-xl md:rounded-2xl shadow-md flex-shrink-0"
          >
            <i class="fa-solid fa-person-walking text-sm sm:text-base md:text-lg"></i>
          </div>
          <div class="min-w-0">
            <h4 class="font-bold text-white leading-tight truncate text-xs sm:text-sm">
              {{ store.currentInstruction.instruction }}
            </h4>
            <p
              class="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase mt-0.5 truncate tracking-wider"
            >
              {{ store.navigation.originName }} → {{ store.navigation.destinationName }} — {{ store.isAccessible ? 'acessível' : 'padrão' }}
            </p>
          </div>
        </div>

        <!-- Right: Distance / Time + Step Buttons -->
        <div class="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
          <div class="text-right">
            <span class="text-xs sm:text-sm font-extrabold text-blue-400 block whitespace-nowrap">
              {{ store.remainingTime }} min
            </span>
            <span class="text-[10px] sm:text-xs font-semibold text-slate-400 block whitespace-nowrap">
              {{ store.remainingDistance }} m
            </span>
          </div>

          <!-- Next / Prev controls for manual stepping -->
          <div class="flex items-center gap-0.5 sm:gap-1 border-l border-white/10 pl-2 sm:pl-3">
            <button
              type="button"
              title="Passo anterior"
              @click="store.stepNavigation(-1)"
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-white/10 text-slate-400 flex items-center justify-center transition-colors"
            >
              <i class="fa-solid fa-chevron-left text-[10px] sm:text-xs"></i>
            </button>
            <button
              type="button"
              title="Próximo passo"
              @click="store.stepNavigation(1)"
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-white/10 text-slate-400 flex items-center justify-center transition-colors"
            >
              <i class="fa-solid fa-chevron-right text-[10px] sm:text-xs"></i>
            </button>
            <button
              type="button"
              title="Encerrar navegação"
              @click="store.stopNavigation()"
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-rose-950/40 text-rose-400 flex items-center justify-center transition-colors ml-0.5 sm:ml-1"
            >
              <i class="fa-solid fa-xmark text-xs sm:text-sm"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- CONTROLES DE VISUALIZAÇÃO (rodapé direita): Condensados no mobile portrait/landscape -->
    <div
      class="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 md:bottom-6 md:right-6 z-[1000] flex items-center gap-1.5 sm:gap-2 md:gap-3 pointer-events-auto"
    >
      <!-- Dark Mode -->
      <button
        id="btn-dark-mode"
        type="button"
        title="Alternar Modo Escuro"
        @click="store.toggleDarkMode"
        class="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-white/95 dark:bg-[#1a1f2e]/95 text-slate-600 dark:text-white backdrop-blur-md rounded-full shadow-lg border border-slate-100 dark:border-white/10 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-[#252c3e] transition-all active:scale-95"
      >
        <i
          :class="[
            'text-xs sm:text-sm md:text-base',
            store.isDarkMode ? 'fa-solid fa-sun text-amber-400' : 'fa-solid fa-moon text-slate-600'
          ]"
        ></i>
      </button>

      <!-- Layer Visibility -->
      <button
        id="btn-toggle-layers-vis"
        type="button"
        title="Ocultar/Exibir Rótulos e Ícones"
        @click="store.toggleLayersVisibility"
        class="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-white/95 dark:bg-[#1a1f2e]/95 text-slate-600 dark:text-white backdrop-blur-md rounded-full shadow-lg border border-slate-100 dark:border-white/10 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-[#252c3e] transition-all active:scale-95"
      >
        <i
          :class="[
            'text-xs sm:text-sm md:text-base',
            store.layersVisible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash text-slate-400'
          ]"
        ></i>
      </button>

      <!-- GPS / Center -->
      <button
        id="btn-center-locate"
        type="button"
        title="Centralizar na Localização"
        @click="locateUser"
        class="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-white/95 dark:bg-[#1a1f2e]/95 text-slate-600 dark:text-white backdrop-blur-md rounded-full shadow-lg border border-slate-100 dark:border-white/10 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-[#252c3e] transition-all active:scale-95"
      >
        <i class="fa-solid fa-crosshairs text-xs sm:text-sm md:text-base"></i>
      </button>
    </div>
  </main>
</template>
