/**
 * Gerenciamento de Estado Global Reativo (Pinia)
 * mainStore.js
 * Orquestra dados, lógica do motor de rotas e sincronização com a interface.
 */

import { defineStore } from 'pinia';
import { dataLoader } from '../layers/data/dataLoader.js';
import { RouteEngine } from '../layers/logic/engine.js';
import { MAP_CONFIG } from '../layers/logic/spatialUtils.js';
import { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID } from '../layers/data/tileProviders.js';

export const useMainStore = defineStore('main', {
  state: () => ({
    // Estados de ciclo de vida
    isLoading: true,
    isReady: false,
    errorMessage: null,

    // Notificações Toast
    notification: {
      visible: false,
      message: '',
      type: 'info', // 'info' | 'success' | 'error' | 'warning'
      timer: null
    },

    // Dados GeoJSON
    geoData: {
      salas: null,
      floor: null,
      pontos: null,
      corredores: null
    },

    // Motor de rotas compilado e lista unificada de locais
    routeEngine: null,
    locations: [],

    // Seleção e visualização
    currentFloor: '0', // '0' = Térreo, '1' = 1º Andar, '2' = 2º Andar
    selectedRoom: null, // Objeto de feature ou nome da sala
    activeCategory: null, // 'sala', 'laboratório', 'banheiro', 'secretaria', 'biblioteca', 'auditório'
    searchQuery: '',

    // Abas e Painéis da Sidebar
    activeTab: 'info', // 'info' | 'rotas'
    isSidebarCollapsed: false,

    // Preferências e visualização do mapa
    isDarkMode: false,
    layersVisible: true, // Visibilidade de rótulos e marcadores POI
    mapViewMode: 'Padrão', // 'Padrão' | 'Satélite' | 'Híbrido'

    // Parâmetros de rota
    originNodeId: '',
    destinationNodeId: '',
    isAccessible: true, // True = Rota acessível (sem escadas), False = Padrão

    // Coleção de rotas calculadas (Principal + Alternativas viáveis)
    routes: [],
    selectedRouteIndex: 0,

    // Estado da navegação em tempo real / passo a passo
    navigation: {
      isActive: false,
      route: [], // Array de nós da rota selecionada
      currentSegmentIndex: 0,
      instructions: [],
      originName: '',
      destinationName: '',
      userPosition: null, // { lat, lng }
      watchId: null
    },

    // Modal de Detalhes
    isDetailsModalOpen: false,
    modalRoom: null,

    // Modal de Configurações
    isSettingsModalOpen: false,

    // Preferências avançadas de Mapa e Tiles ("Tyler")
    selectedTileProvider: DEFAULT_TILE_PROVIDER_ID,
    maxZoomLevel: 25,
    floorOpacity: 0.85,
    tileSharpness: true,

    // Gatilho para recentralizar mapa externamente
    mapCenterRequest: null, // { lat, lng, zoom }

    // Recurso de Transição de Andar (Mudança de andar / Elevador)
    floorTransition: null,
    filterRoutesByCurrentFloor: true
  }),

  getters: {
    /**
     * Lista unificada de nós disponíveis para os selects de Origem e Destino
     * Unifica salas, pontos de interesse e nós de corredor nomeados
     */
    routableNodes(state) {
      if (state.locations && state.locations.length > 0) {
        return state.locations;
      }
      if (!state.routeEngine) return [];
      return state.routeEngine.locations || [];
    },

    currentFloorName(state) {
      if (state.currentFloor === '0') return 'Térreo';
      return `${state.currentFloor}º Andar`;
    },

    nodesForCurrentFloor(state) {
      const nodes = this.routableNodes;
      return nodes.filter((n) => String(n.andar) === String(state.currentFloor));
    },

    elevatorsForCurrentFloor(state) {
      return this.routableNodes.filter(
        (n) =>
          (n.isElevator || n.tipo === 'elevador' || n.nome?.toLowerCase().includes('elevador')) &&
          String(n.andar) === String(state.currentFloor)
      );
    },

    allElevators(state) {
      return this.routableNodes.filter(
        (n) => n.isElevator || n.tipo === 'elevador' || n.nome?.toLowerCase().includes('elevador')
      );
    },

    /**
     * Rota atualmente selecionada para navegação
     */
    activeRoute(state) {
      if (!state.routes || state.routes.length === 0) return null;
      return state.routes[state.selectedRouteIndex] || state.routes[0] || null;
    },

    /**
     * Salas filtradas pela query do autocomplete
     */
    filteredSalas(state) {
      const rawQ = state.searchQuery || '';
      const normalize = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const q = normalize(rawQ);
      if (!q || !state.geoData.salas) return [];

      const tokens = q.split(/\s+/).filter(Boolean);

      return state.geoData.salas.features
        .filter((f) => {
          const p = f.properties;
          if (!p || !p.nome) return false;
          const target = normalize(`${p.nome} ${p.tipo || ''} ${p.bloco || ''} ${p.andar === 0 || p.andar === '0' ? 'terreo' : p.andar + ' andar'}`);
          return tokens.every((tok) => target.includes(tok));
        })
        .sort((a, b) => (a.properties.nome || '').localeCompare(b.properties.nome || ''));
    },

    /**
     * Itens da categoria selecionada
     */
    categoryItems(state) {
      if (!state.activeCategory) return [];
      const cat = state.activeCategory.toLowerCase();

      let items = [];
      if (cat === 'banheiro') {
        if (state.geoData.pontos) {
          items = state.geoData.pontos.features.filter(
            (f) => f.properties?.tipo && f.properties.tipo.toLowerCase().includes('banheiro')
          );
        }
      } else {
        if (state.geoData.salas) {
          items = state.geoData.salas.features.filter(
            (f) => f.properties?.tipo && f.properties.tipo.toLowerCase().includes(cat)
          );
        }
      }

      return items.sort((a, b) => (a.properties?.nome || '').localeCompare(b.properties?.nome || ''));
    },

    /**
     * Feature da sala atualmente selecionada
     */
    selectedRoomFeature(state) {
      if (!state.selectedRoom) return null;
      const roomName =
        typeof state.selectedRoom === 'string'
          ? state.selectedRoom
          : state.selectedRoom.properties?.nome;

      if (!roomName) return null;

      let found = state.geoData.salas?.features.find(
        (f) => f.properties?.nome === roomName
      );
      if (!found && state.geoData.pontos) {
        found = state.geoData.pontos.features.find(
          (f) => f.properties?.nome === roomName
        );
      }
      return found || null;
    },

    /**
     * Instrução ativa na navegação
     */
    currentInstruction(state) {
      if (
        !state.navigation.isActive ||
        state.navigation.instructions.length === 0
      ) {
        return null;
      }
      const idx = state.navigation.currentSegmentIndex;
      return state.navigation.instructions[idx] || null;
    },

    /**
     * Distância restante até o destino
     */
    remainingDistance(state) {
      if (!state.activeRoute) return 0;
      if (!state.navigation.isActive || !state.routeEngine) {
        return state.activeRoute.totalDistance;
      }
      return state.routeEngine.calculateTotalDistance(
        state.navigation.route,
        state.navigation.currentSegmentIndex
      );
    },

    /**
     * Tempo restante estimado em minutos
     */
    remainingTime(state) {
      const dist = this.remainingDistance;
      if (!state.routeEngine || dist <= 0) return 0;
      return state.routeEngine.estimateWalkingTimeMinutes(dist);
    },

    /**
     * Indica se há uma rota calculada pronta para exibição
     */
    hasRoute(state) {
      return state.routes && state.routes.length > 0;
    },

    /**
     * Indica se existem rotas alternativas além da principal
     */
    hasAlternatives(state) {
      return state.routes && state.routes.length > 1;
    }
  },

  actions: {
    /**
     * Inicializa a aplicação, carregando dados e construindo grafo
     */
    async initApp() {
      this.isLoading = true;
      this.errorMessage = null;
      this.loadPersistedSettings();

      // Em dispositivos móveis (< 768px), inicia a sidebar recolhida para dar visão total ao mapa
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        this.isSidebarCollapsed = true;
      }

      try {
        const { salas, floor, pontos, corredores } = await dataLoader.loadAll();
        this.geoData.salas = salas;
        this.geoData.floor = floor;
        this.geoData.pontos = pontos;
        this.geoData.corredores = corredores;

        // Construir Grafo de Navegação com arquitetura desacoplada
        this.routeEngine = new RouteEngine(corredores, salas, pontos);
        this.locations = this.routeEngine.locations;

        this.isReady = true;
        this.isLoading = false;
        this.showNotification('Mapa carregado com sucesso!', 'success');
      } catch (err) {
        this.isLoading = false;
        this.errorMessage = err.message || 'Erro ao carregar dados do mapa.';
        this.showNotification(this.errorMessage, 'error');
        console.error('Falha ao inicializar app:', err);
      }
    },

    /**
     * Alterna o andar ativo
     */
    setFloor(floor) {
      this.currentFloor = String(floor);
    },

    /**
     * Seleciona uma sala ou ponto e sincroniza andar
     */
    selectRoom(room, triggerCenter = true) {
      let feature = null;
      let roomName = '';

      if (typeof room === 'string') {
        roomName = room;
        feature =
          this.geoData.salas?.features.find((f) => f.properties?.nome === room) ||
          this.geoData.pontos?.features.find((f) => f.properties?.nome === room);
      } else if (room && room.properties) {
        feature = room;
        roomName = room.properties.nome;
      }

      if (!feature) {
        this.selectedRoom = roomName;
        return;
      }

      this.selectedRoom = feature;
      this.searchQuery = roomName;

      // Sincronizar andar
      if (feature.properties?.andar !== undefined) {
        this.setFloor(feature.properties.andar);
      }

      // Ativar aba de informações
      this.activeTab = 'info';

      // Requisitar centralização no mapa se desejado
      if (triggerCenter) {
        this.mapCenterRequest = {
          feature,
          timestamp: Date.now()
        };
      }
    },

    /**
     * Limpa a seleção da sala
     */
    clearRoomSelection() {
      this.selectedRoom = null;
      this.searchQuery = '';
    },

    /**
     * Define categoria ativa
     */
    setActiveCategory(category) {
      this.activeCategory = category;
      this.clearRoomSelection();
    },

    /**
     * Volta da listagem de categoria para o grid
     */
    clearActiveCategory() {
      this.activeCategory = null;
    },

    /**
     * Alterna a aba ativa da sidebar ('info' ou 'rotas')
     */
    setActiveTab(tab) {
      this.activeTab = tab;
    },

    /**
     * Alterna colapso da sidebar
     */
    toggleSidebar() {
      this.isSidebarCollapsed = !this.isSidebarCollapsed;
    },

    /**
     * Alterna modo escuro
     */
    toggleDarkMode() {
      this.isDarkMode = !this.isDarkMode;
      if (this.isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      this.saveSettings();
    },

    /**
     * Alterna visibilidade de rótulos e ícones POI
     */
    toggleLayersVisibility() {
      this.layersVisible = !this.layersVisible;
      this.showNotification(
        this.layersVisible ? 'Rótulos e pontos reativados' : 'Rótulos e pontos ocultados',
        this.layersVisible ? 'success' : 'info'
      );
    },

    /**
     * Define preferências de acessibilidade e recalcula rota se aplicável
     */
    setAccessiblePreference(value) {
      this.isAccessible = Boolean(value);
      // Auto-cálculo ao alternar o modo de acessibilidade
      if (this.originNodeId && this.destinationNodeId && this.originNodeId !== this.destinationNodeId) {
        this.calculateRoute(false);
      }
    },

    /**
     * Define Ponto de Partida e dispara cálculo automático se destino estiver preenchido
     */
    setOriginNodeId(nodeId) {
      this.originNodeId = nodeId;
      if (this.originNodeId && this.destinationNodeId && this.originNodeId !== this.destinationNodeId) {
        this.calculateRoute();
      }
    },

    /**
     * Define Destino e dispara cálculo automático se partida estiver preenchida
     */
    setDestinationNodeId(nodeId) {
      this.destinationNodeId = nodeId;
      if (this.originNodeId && this.destinationNodeId && this.originNodeId !== this.destinationNodeId) {
        this.calculateRoute();
      }
    },

    /**
     * Helper para localizar um item da lista unificada de locations por nome ou ID
     */
    findLocation(nameOrId) {
      if (!nameOrId) return null;
      const target = String(nameOrId).trim().toLowerCase();

      // Busca por ID exato
      let found = this.routableNodes.find((l) => l.id.toLowerCase() === target);
      if (found) return found;

      // Busca por nome exato
      found = this.routableNodes.find((l) => l.nome && l.nome.toLowerCase() === target);
      if (found) return found;

      // Busca por nome parcial
      found = this.routableNodes.find(
        (l) => l.nome && l.nome.toLowerCase().includes(target)
      );
      return found || null;
    },

    /**
     * Configura um local como origem da rota
     */
    setAsOrigin(roomName) {
      const loc = this.findLocation(roomName);
      if (loc) {
        this.originNodeId = loc.id;
        this.setActiveTab('rotas');
        this.showNotification(`Origem definida: ${loc.nome}`, 'info');

        // Auto-cálculo se destino já estiver configurado
        if (this.destinationNodeId && this.destinationNodeId !== this.originNodeId) {
          this.calculateRoute();
        }
      } else {
        this.showNotification('Local não encontrado no grafo de navegação.', 'warning');
      }
    },

    /**
     * Configura um local como destino da rota
     */
    setAsDestination(roomName) {
      const loc = this.findLocation(roomName);
      if (loc) {
        this.destinationNodeId = loc.id;
        this.setActiveTab('rotas');
        this.showNotification(`Destino definido: ${loc.nome}`, 'info');

        // Auto-cálculo se origem já estiver configurada
        if (this.originNodeId && this.originNodeId !== this.destinationNodeId) {
          this.calculateRoute();
        }
      } else {
        this.showNotification('Local não encontrado no grafo de navegação.', 'warning');
      }
    },

    /**
     * Calcula a rota principal e rotas alternativas viáveis
     * @param {boolean} showToast 
     */
    /**
     * Calcula a rota focada no andar correspondente com transição por elevador se necessário
     * @param {boolean} showToast 
     */
    calculateRoute(showToast = true) {
      if (!this.routeEngine) return;

      if (!this.originNodeId || !this.destinationNodeId) {
        if (showToast) {
          this.showNotification('Por favor, selecione ponto de partida e destino.', 'error');
        }
        return;
      }

      if (this.originNodeId === this.destinationNodeId) {
        if (showToast) {
          this.showNotification('A origem e o destino são idênticos.', 'warning');
        }
        return;
      }

      const originLoc = this.findLocation(this.originNodeId);
      const destLoc = this.findLocation(this.destinationNodeId);

      const originFloor = originLoc?.andar !== undefined ? String(originLoc.andar) : String(this.currentFloor);
      const destFloor = destLoc?.andar !== undefined ? String(destLoc.andar) : String(this.currentFloor);

      // CASO A: Origem e Destino em andares diferentes -> Necessidade de Mudança de Andar
      if (originFloor !== destFloor) {
        const originFloorName = originFloor === '0' ? 'Térreo' : `${originFloor}º Andar`;
        const destFloorName = destFloor === '0' ? 'Térreo' : `${destFloor}º Andar`;

        // Localizar elevadores nos andares de origem e destino
        const originElevators = this.locations.filter(
          (l) => (l.isElevator || l.tipo === 'elevador' || l.nome.toLowerCase().includes('elevador')) &&
                 !l.isDisabled &&
                 String(l.andar) === originFloor
        );
        const destElevators = this.locations.filter(
          (l) => (l.isElevator || l.tipo === 'elevador' || l.nome.toLowerCase().includes('elevador')) &&
                 !l.isDisabled &&
                 String(l.andar) === destFloor
        );

        const targetElevatorOrigin = originElevators[0] || null;
        const targetElevatorDest = destElevators[0] || null;

        if (!targetElevatorOrigin) {
          if (showToast) {
            this.showNotification(`Nenhum elevador encontrado no ${originFloorName} para transição.`, 'error');
          }
          return;
        }

        this.floorTransition = {
          active: true,
          originFloor,
          destinationFloor: destFloor,
          originFloorName,
          destinationFloorName: destFloorName,
          elevator: targetElevatorOrigin,
          elevatorDest: targetElevatorDest,
          elevatorName: targetElevatorOrigin.nome || 'Elevador FAET',
          finalDestinationNode: destLoc,
          finalDestinationName: destLoc?.nome || 'Destino',
          currentPhase: 'origin_to_elevator'
        };

        // Calcula a rota no andar correspondente até o Elevador
        const calculatedRoutes = this.routeEngine.findRoutes(
          originLoc.id,
          targetElevatorOrigin.id,
          {
            accessibilityMode: this.isAccessible,
            maxAlternatives: 2
          }
        );

        if (!calculatedRoutes || calculatedRoutes.length === 0) {
          this.routes = [];
          this.navigation.isActive = false;
          if (showToast) {
            this.showNotification(`Não foi possível traçar rota até o elevador no ${originFloorName}.`, 'error');
          }
          return;
        }

        this.routes = calculatedRoutes;
        this.selectRoute(0);
        this.setFloor(originFloor);
        this.setActiveTab('rotas');

        if (showToast) {
          this.showNotification(
            `Destino no ${destFloorName}. Rota traçada no ${originFloorName} até o ${targetElevatorOrigin.nome} (${calculatedRoutes[0].totalDistance} m).`,
            'info'
          );
        }
        return;
      }

      // CASO B: Mesmo andar -> Rota direta no andar correspondente
      this.floorTransition = null;

      const calculatedRoutes = this.routeEngine.findRoutes(
        this.originNodeId,
        this.destinationNodeId,
        {
          accessibilityMode: this.isAccessible,
          maxAlternatives: 2
        }
      );

      if (!calculatedRoutes || calculatedRoutes.length === 0) {
        this.routes = [];
        this.navigation.isActive = false;
        if (showToast) {
          this.showNotification(
            'Não foi possível encontrar uma rota no andar selecionado.',
            'error'
          );
        }
        return;
      }

      this.routes = calculatedRoutes;
      this.selectRoute(0);

      // Sincronizar andar com o início da rota
      const startNode = calculatedRoutes[0].nodes[0];
      if (startNode && startNode.andar !== undefined) {
        this.setFloor(startNode.andar);
      }

      this.setActiveTab('rotas');

      if (showToast) {
        const altCount = calculatedRoutes.length - 1;
        const msg =
          altCount > 0
            ? `Rota calculada no ${this.currentFloorName}: ${calculatedRoutes[0].totalDistance} m (+${altCount} ${altCount === 1 ? 'alternativa' : 'alternativas'})`
            : `Rota calculada no ${this.currentFloorName}: ${calculatedRoutes[0].totalDistance} m`;
        this.showNotification(msg, 'success');
      }
    },

    /**
     * Continua a rota no andar de destino a partir do elevador até a sala final
     */
    continueRouteOnDestinationFloor() {
      if (!this.floorTransition || !this.floorTransition.active) return;
      const destFloor = this.floorTransition.destinationFloor;
      const destElevator = this.floorTransition.elevatorDest;
      const finalDest = this.floorTransition.finalDestinationNode;

      if (!finalDest) return;

      this.setFloor(destFloor);
      this.floorTransition.currentPhase = 'elevator_to_destination';

      if (destElevator) {
        const calculatedRoutes = this.routeEngine.findRoutes(
          destElevator.id,
          finalDest.id,
          {
            accessibilityMode: this.isAccessible,
            maxAlternatives: 2
          }
        );

        if (calculatedRoutes && calculatedRoutes.length > 0) {
          this.routes = calculatedRoutes;
          this.selectRoute(0);
          this.showNotification(
            `No ${this.floorTransition.destinationFloorName}: siga do ${destElevator.nome} até ${finalDest.nome} (${calculatedRoutes[0].totalDistance} m).`,
            'success'
          );
          return;
        }
      }

      this.showNotification(
        `Você chegou ao ${this.floorTransition.destinationFloorName}. Prossiga até ${finalDest.nome}.`,
        'info'
      );
    },

    /**
     * Recurso rápido: Localiza e traça rota até o elevador mais próximo no andar correspondente
     */
    routeToNearestElevator() {
      const elevators = this.locations.filter(
        (l) =>
          (l.isElevator || l.tipo === 'elevador' || l.nome.toLowerCase().includes('elevador')) &&
          !l.isDisabled &&
          String(l.andar) === String(this.currentFloor)
      );

      if (elevators.length === 0) {
        this.showNotification(
          `Nenhum elevador cadastrado no andar atual (${this.currentFloorName}).`,
          'warning'
        );
        return;
      }

      const elev = elevators[0];

      // Se não tiver ponto de partida, usa a sala selecionada ou primeiro local do andar
      if (!this.originNodeId) {
        if (this.selectedRoomFeature) {
          this.originNodeId = this.selectedRoomFeature.properties?.nome;
        } else {
          const fallback = this.locations.find(
            (l) => String(l.andar) === String(this.currentFloor) && l.id !== elev.id
          );
          if (fallback) {
            this.originNodeId = fallback.id;
          }
        }
      }

      this.destinationNodeId = elev.id;
      this.setActiveTab('rotas');
      this.calculateRoute(true);
    },

    /**
     * Alterna a rota ativa entre a principal e as alternativas
     * @param {number} index 
     */
    selectRoute(index) {
      if (!this.routes || !this.routes[index]) return;

      this.selectedRouteIndex = index;
      const targetRoute = this.routes[index];

      this.navigation.isActive = true;
      this.navigation.route = targetRoute.nodes;
      this.navigation.currentSegmentIndex = 0;
      this.navigation.instructions = targetRoute.instructions;
      this.navigation.originName = targetRoute.nodes[0]?.nome || '';
      this.navigation.destinationName =
        targetRoute.nodes[targetRoute.nodes.length - 1]?.nome || '';
    },

    /**
     * Avança ou recua passo da navegação
     */
    stepNavigation(direction) {
      if (!this.navigation.isActive) return;

      const newIndex = this.navigation.currentSegmentIndex + direction;

      if (newIndex < 0) return;
      if (newIndex >= this.navigation.instructions.length) {
        this.handleArrival();
        return;
      }

      this.navigation.currentSegmentIndex = newIndex;

      // Sincronizar andar do mapa com o nó do passo atual
      const currentNode = this.navigation.route[newIndex];
      if (currentNode) {
        this.setFloor(currentNode.andar);
        this.mapCenterRequest = {
          lat: currentNode.lat,
          lng: currentNode.lng,
          zoom: MAP_CONFIG.zoom.ROUTE,
          timestamp: Date.now()
        };
      }
    },

    handleArrival() {
      this.showNotification('Você chegou ao seu destino!', 'success');
    },

    /**
     * Encerra a navegação e oculta a barra inferior
     */
    stopNavigation() {
      this.navigation.isActive = false;
      this.navigation.route = [];
      this.navigation.instructions = [];
      this.navigation.currentSegmentIndex = 0;
      if (this.navigation.watchId && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.navigation.watchId);
        this.navigation.watchId = null;
      }
    },

    /**
     * Limpa seleção, rotas calculadas e inputs
     */
    clearRoute() {
      this.stopNavigation();
      this.clearRoomSelection();
      this.routes = [];
      this.selectedRouteIndex = 0;
      this.originNodeId = '';
      this.destinationNodeId = '';
      this.floorTransition = null;
      this.clearActiveCategory();
      this.showNotification('Rota e seleções limpas.', 'info');
    },

    /**
     * Atualiza posição do usuário a partir de GPS
     */
    updateUserPosition(lat, lng) {
      this.navigation.userPosition = { lat, lng };

      if (!this.navigation.isActive) return;

      const route = this.navigation.route;
      const currentIndex = this.navigation.currentSegmentIndex;

      if (currentIndex >= route.length - 1) {
        this.handleArrival();
        return;
      }

      const nextWaypoint = route[currentIndex + 1];
      const distanceToNext = this.routeEngine
        ? calculateDistance(lat, lng, nextWaypoint.lat, nextWaypoint.lng)
        : Infinity;

      if (distanceToNext <= MAP_CONFIG.navigation.PROXIMITY_THRESHOLD) {
        this.stepNavigation(1);
      }
    },

    /**
     * Exibe notificação toast
     */
    showNotification(message, type = 'info') {
      if (this.notification.timer) {
        clearTimeout(this.notification.timer);
      }
      this.notification.message = message;
      this.notification.type = type;
      this.notification.visible = true;

      this.notification.timer = setTimeout(() => {
        this.notification.visible = false;
      }, 3500);
    },

    dismissNotification() {
      this.notification.visible = false;
      if (this.notification.timer) {
        clearTimeout(this.notification.timer);
      }
    },

    /**
     * Abre e fecha o modal de detalhes completos
     */
    openDetailsModal(room) {
      this.modalRoom = room;
      this.isDetailsModalOpen = true;
    },

    closeDetailsModal() {
      this.isDetailsModalOpen = false;
      this.modalRoom = null;
    },

    /**
     * Modal de Configurações (Estilos de Mapa / Tyler & Super Zoom)
     */
    openSettingsModal() {
      this.isSettingsModalOpen = true;
    },

    closeSettingsModal() {
      this.isSettingsModalOpen = false;
    },

    /**
     * Altera o estilo de mapa / provedor de tiles ("tyler")
     */
    setTileProvider(providerId) {
      if (TILE_PROVIDERS[providerId]) {
        this.selectedTileProvider = providerId;
        this.saveSettings();
        this.showNotification(`Estilo do mapa: ${TILE_PROVIDERS[providerId].name}`, 'info');
      }
    },

    /**
     * Define o limite máximo de aproximação (Zoom)
     */
    setMaxZoomLevel(level) {
      const zoom = Number(level);
      if (!isNaN(zoom) && zoom >= 18 && zoom <= 28) {
        this.maxZoomLevel = zoom;
        this.saveSettings();
        this.showNotification(`Zoom máximo ajustado para ${zoom}x`, 'info');
      }
    },

    /**
     * Define a opacidade da planta baixa do andar (0 a 1)
     */
    setFloorOpacity(opacity) {
      const val = parseFloat(opacity);
      if (!isNaN(val)) {
        this.floorOpacity = Math.max(0, Math.min(1, val));
        this.saveSettings();
      }
    },

    /**
     * Alterna nitidez dos tiles em super zoom
     */
    toggleTileSharpness() {
      this.tileSharpness = !this.tileSharpness;
      this.saveSettings();
    },

    /**
     * Salva configurações no armazenamento local do navegador
     */
    saveSettings() {
      try {
        const payload = {
          selectedTileProvider: this.selectedTileProvider,
          maxZoomLevel: this.maxZoomLevel,
          floorOpacity: this.floorOpacity,
          tileSharpness: this.tileSharpness,
          isDarkMode: this.isDarkMode,
          isAccessible: this.isAccessible
        };
        localStorage.setItem('mapa_totem_settings', JSON.stringify(payload));
      } catch (e) {
        // Ignora caso restrito
      }
    },

    /**
     * Carrega configurações previamente salvas
     */
    loadPersistedSettings() {
      try {
        const raw = localStorage.getItem('mapa_totem_settings');
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.selectedTileProvider && TILE_PROVIDERS[s.selectedTileProvider]) {
          this.selectedTileProvider = s.selectedTileProvider;
        }
        if (s.maxZoomLevel && typeof s.maxZoomLevel === 'number') {
          this.maxZoomLevel = Math.max(18, Math.min(28, s.maxZoomLevel));
        }
        if (s.floorOpacity !== undefined && typeof s.floorOpacity === 'number') {
          this.floorOpacity = Math.max(0, Math.min(1, s.floorOpacity));
        }
        if (s.tileSharpness !== undefined) {
          this.tileSharpness = Boolean(s.tileSharpness);
        }
        if (s.isDarkMode !== undefined) {
          this.isDarkMode = Boolean(s.isDarkMode);
          if (this.isDarkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        if (s.isAccessible !== undefined) {
          this.isAccessible = Boolean(s.isAccessible);
        }
      } catch (e) {
        // Fallback silencioso
      }
    }
  }
});
