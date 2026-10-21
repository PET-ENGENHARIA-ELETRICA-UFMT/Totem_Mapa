/**
 * Gerenciamento de Estado Global Reativo (Pinia)
 * mainStore.js
 * Orquestra dados, lógica do motor de rotas e sincronização com a interface.
 */

import { defineStore } from 'pinia';
import { dataLoader } from '../layers/data/dataLoader.js';
import { RouteEngine } from '../layers/logic/engine.js';
import { calculateDistance, MAP_CONFIG } from '../layers/logic/spatialUtils.js';
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
    filterRoutesByCurrentFloor: true,

    // Modal de Administrador e Gestão Topológica
    isAdminModalOpen: false,
    adminDataVersion: 0,
    adminOverrides: {}
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

        // Aplicar personalizações salvas pelo Administrador
        this.applyAdminOverridesToGeoData();

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
     * Alterna o andar ativo e sincroniza etapas da rota multi-andares se aplicável
     */
    setFloor(floor) {
      const f = String(floor);
      this.currentFloor = f;

      if (this.floorTransition && this.floorTransition.active) {
        if (f === String(this.floorTransition.destinationFloor)) {
          if (this.floorTransition.stage !== 2) {
            this.switchFloorTransitionStage(2);
          }
        } else if (f === String(this.floorTransition.originFloor)) {
          if (this.floorTransition.stage !== 1) {
            this.switchFloorTransitionStage(1);
          }
        } else {
          // Andar não participante do trajeto
          this.routes = [];
        }
      }
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

      // CASO A: Origem e Destino em andares diferentes -> Navegação Multi-Andares (2 etapas contínuas)
      if (originFloor !== destFloor) {
        const originFloorName = originFloor === '0' ? 'Térreo' : `${originFloor}º Andar`;
        const destFloorName = destFloor === '0' ? 'Térreo' : `${destFloor}º Andar`;

        // 1. Filtrar conectores verticais disponíveis no andar de origem (Elevadores ou Escadas)
        const originCandidates = this.locations.filter((l) => {
          if (String(l.andar) !== originFloor || l.isDisabled) return false;
          if (this.isAccessible) {
            return l.isElevator || l.tipo === 'elevador' || l.nome.toLowerCase().includes('elevador') || l.tipo === 'rampa';
          }
          return (
            l.isElevator ||
            l.tipo === 'elevador' ||
            l.nome.toLowerCase().includes('elevador') ||
            l.tipo === 'escada' ||
            l.nome.toLowerCase().includes('escada') ||
            l.tipo === 'rampa'
          );
        });

        // 2. Para cada conector na origem, emparelhar com o conector equivalente no andar de destino
        const validPairs = [];
        for (const oCand of originCandidates) {
          const isElev = oCand.isElevator || oCand.tipo === 'elevador' || oCand.nome.toLowerCase().includes('elevador');
          const isStair = oCand.tipo === 'escada' || oCand.nome.toLowerCase().includes('escada');

          const destCandidates = this.locations.filter((l) => {
            if (String(l.andar) !== destFloor || l.isDisabled) return false;
            if (isElev) {
              return l.isElevator || l.tipo === 'elevador' || l.nome.toLowerCase().includes('elevador');
            }
            if (isStair) {
              return l.tipo === 'escada' || l.nome.toLowerCase().includes('escada');
            }
            return false;
          });

          if (destCandidates.length > 0) {
            let bestDest = destCandidates[0];
            let minD = Infinity;
            for (const d of destCandidates) {
              const dist = calculateDistance(oCand.coordinates[1], oCand.coordinates[0], d.coordinates[1], d.coordinates[0]);
              if (dist < minD) {
                minD = dist;
                bestDest = d;
              }
            }

            const distFromOrigin = calculateDistance(
              originLoc.coordinates[1],
              originLoc.coordinates[0],
              oCand.coordinates[1],
              oCand.coordinates[0]
            );

            validPairs.push({
              originTrans: oCand,
              destTrans: bestDest,
              distFromOrigin,
              isElev,
              isStair
            });
          }
        }

        if (validPairs.length === 0) {
          if (showToast) {
            this.showNotification(`Nenhum elevador ou escada encontrado para ligar o ${originFloorName} ao ${destFloorName}.`, 'error');
          }
          return;
        }

        // Escolhe o par de transição mais próximo do ponto de partida
        validPairs.sort((a, b) => a.distFromOrigin - b.distFromOrigin);
        const bestPair = validPairs[0];

        // 3. Pré-calcular as duas etapas da rota (com exatamente 1 rota alternativa viável)
        const stage1Routes = this.routeEngine.findRoutes(
          originLoc.id,
          bestPair.originTrans.id,
          {
            accessibilityMode: this.isAccessible,
            maxAlternatives: 1
          }
        );

        const stage2Routes = this.routeEngine.findRoutes(
          bestPair.destTrans.id,
          destLoc.id,
          {
            accessibilityMode: this.isAccessible,
            maxAlternatives: 1
          }
        );

        if (!stage1Routes || stage1Routes.length === 0) {
          this.routes = [];
          this.navigation.isActive = false;
          if (showToast) {
            this.showNotification(`Não foi possível traçar rota até ${bestPair.originTrans.nome} no ${originFloorName}.`, 'error');
          }
          return;
        }

        const transType = bestPair.isElev ? 'elevador' : 'escada';
        const transLabel = bestPair.isElev ? 'o elevador' : 'a escada';

        this.floorTransition = {
          active: true,
          type: transType,
          originFloor,
          destinationFloor: destFloor,
          originFloorName,
          destinationFloorName: destFloorName,
          originTransNode: bestPair.originTrans,
          destTransNode: bestPair.destTrans,
          transitionName: bestPair.originTrans.nome || (bestPair.isElev ? 'Elevador FAET' : 'Escada'),
          finalOriginNode: originLoc,
          finalDestinationNode: destLoc,
          finalDestinationName: destLoc?.nome || 'Destino',
          stage: 1,
          stage1Routes,
          stage2Routes
        };

        this.routes = stage1Routes;
        this.selectRoute(0);
        this.setFloor(originFloor);
        this.setActiveTab('rotas');

        if (showToast) {
          const totalMeters = stage1Routes[0].totalDistance + (stage2Routes[0]?.totalDistance || 0);
          this.showNotification(
            `Destino no ${destFloorName}. Rota em 2 etapas via ${transLabel} (${totalMeters} m total).`,
            'info'
          );
        }
        return;
      }

      // CASO B: Mesmo andar -> Rota direta no andar correspondente (1 principal + 1 alternativa viável)
      this.floorTransition = null;

      const calculatedRoutes = this.routeEngine.findRoutes(
        this.originNodeId,
        this.destinationNodeId,
        {
          accessibilityMode: this.isAccessible,
          maxAlternatives: 1
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
            ? `Rota calculada no ${this.currentFloorName}: ${calculatedRoutes[0].totalDistance} m (+1 rota alternativa)`
            : `Rota calculada no ${this.currentFloorName}: ${calculatedRoutes[0].totalDistance} m`;
        this.showNotification(msg, 'success');
      }
    },

    /**
     * Alterna entre a Etapa 1 e Etapa 2 de forma contínua em rotas multi-andares
     */
    switchFloorTransitionStage(targetStage) {
      if (!this.floorTransition || !this.floorTransition.active) return;
      if (targetStage === 2) {
        this.floorTransition.stage = 2;
        this.currentFloor = String(this.floorTransition.destinationFloor);
        this.routes = this.floorTransition.stage2Routes || [];
        if (this.routes.length > 0) {
          this.selectRoute(0);
        }
        this.showNotification(
          `No ${this.floorTransition.destinationFloorName}: siga até ${this.floorTransition.finalDestinationName}.`,
          'info'
        );
      } else if (targetStage === 1) {
        this.floorTransition.stage = 1;
        this.currentFloor = String(this.floorTransition.originFloor);
        this.routes = this.floorTransition.stage1Routes || [];
        if (this.routes.length > 0) {
          this.selectRoute(0);
        }
        this.showNotification(
          `No ${this.floorTransition.originFloorName}: siga até ${this.floorTransition.transitionName}.`,
          'info'
        );
      }
    },

    /**
     * Continua a rota no andar de destino a partir do elevador/escada até a sala final
     */
    continueRouteOnDestinationFloor() {
      this.switchFloorTransitionStage(2);
    },

    /**
     * Retorna à etapa anterior no andar de origem
     */
    goToPreviousFloorStage() {
      this.switchFloorTransitionStage(1);
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
    },

    /**
     * Métodos do Painel do Administrador
     */
    openAdminModal() {
      this.isAdminModalOpen = true;
    },

    closeAdminModal() {
      this.isAdminModalOpen = false;
    },

    loadAdminOverrides() {
      try {
        const raw = localStorage.getItem('totem_admin_overrides');
        if (raw) {
          this.adminOverrides = JSON.parse(raw);
        } else {
          this.adminOverrides = {};
        }
      } catch (e) {
        this.adminOverrides = {};
      }
    },

    saveAdminOverrides() {
      try {
        localStorage.setItem('totem_admin_overrides', JSON.stringify(this.adminOverrides || {}));
      } catch (e) {
        console.error('Falha ao salvar admin overrides no localStorage', e);
      }
    },

    applyAdminOverridesToGeoData() {
      this.loadAdminOverrides();
      const overrides = this.adminOverrides || {};

      // Aplicar em salas
      if (this.geoData.salas?.features) {
        for (const feat of this.geoData.salas.features) {
          const key = feat.properties?.id || feat.properties?.nome;
          if (key && overrides[key]) {
            Object.assign(feat.properties, overrides[key]);
            if (overrides[key].ativo === false) {
              feat.properties.status_bloqueado = true;
            } else if (overrides[key].ativo === true && feat.properties.tipo_uso !== 'status_bloqueado') {
              feat.properties.status_bloqueado = false;
            }
          }
        }
      }

      // Aplicar em pontos
      if (this.geoData.pontos?.features) {
        for (const feat of this.geoData.pontos.features) {
          const key = feat.properties?.id || feat.properties?.nome;
          if (key && overrides[key]) {
            Object.assign(feat.properties, overrides[key]);
          }
        }
      }

      // Aplicar em corredores
      if (this.geoData.corredores?.features) {
        for (const feat of this.geoData.corredores.features) {
          const key = feat.properties?.id;
          if (key && overrides[key]) {
            Object.assign(feat.properties, overrides[key]);
          }
        }
      }
    },

    /**
     * Atualiza as propriedades 'ativo' e/ou 'acessivel' de um local ou componente
     * @param {'salas'|'pontos'|'corredores'} category 
     * @param {string} identifier - id ou nome da feature
     * @param {Object} updates - { ativo?: boolean, acessivel?: boolean, tipo_uso?: string, nome?: string }
     */
    updateLocationProperty(category, identifier, updates) {
      if (!identifier || !updates) return;

      const dataset = this.geoData[category];
      if (!dataset || !dataset.features) return;

      const feat = dataset.features.find(
        (f) => f.properties?.id === identifier || f.properties?.nome === identifier
      );

      if (!feat) return;
      if (!feat.properties) feat.properties = {};

      const key = feat.properties.id || feat.properties.nome || identifier;

      // 1. Atualizar properties da feature GeoJSON
      if (updates.ativo !== undefined) {
        feat.properties.ativo = Boolean(updates.ativo);
        if (updates.ativo === false) {
          feat.properties.status_bloqueado = true;
        } else if (feat.properties.tipo_uso !== 'status_bloqueado') {
          feat.properties.status_bloqueado = false;
        }
      }

      if (updates.acessivel !== undefined) {
        feat.properties.acessivel = Boolean(updates.acessivel);
        feat.properties.acessibilidade = String(Boolean(updates.acessivel));
      }

      if (updates.tipo_uso !== undefined) {
        feat.properties.tipo_uso = updates.tipo_uso;
      }

      if (updates.nome !== undefined && updates.nome.trim()) {
        feat.properties.nome = updates.nome.trim();
      }

      // 2. Persistir no adminOverrides
      if (!this.adminOverrides) this.adminOverrides = {};
      this.adminOverrides[key] = {
        ...(this.adminOverrides[key] || {}),
        ...updates
      };
      this.saveAdminOverrides();

      // 3. Atualizar nós correspondentes no RouteEngine e em this.locations
      if (this.locations) {
        const loc = this.locations.find(
          (l) => l.id === key || l.nome === key || l.rawName === key || (l.feature?.properties?.id === key)
        );
        if (loc) {
          if (updates.ativo !== undefined) {
            loc.isDisabled = !updates.ativo;
            loc.ativo = Boolean(updates.ativo);
          }
          if (updates.acessivel !== undefined) {
            loc.acessivel = Boolean(updates.acessivel);
          }
          if (updates.nome !== undefined) {
            loc.nome = updates.nome.trim();
          }
        }
      }

      if (this.routeEngine && this.routeEngine.nodes) {
        for (const [nodeId, node] of this.routeEngine.nodes) {
          if (nodeId === key || node.nome === key || node.rawName === key || (node.feature?.properties?.id === key)) {
            if (updates.ativo !== undefined) {
              node.isDisabled = !updates.ativo;
              node.ativo = Boolean(updates.ativo);
            }
            if (updates.acessivel !== undefined) {
              node.acessivel = Boolean(updates.acessivel);
            }
            if (updates.nome !== undefined) {
              node.nome = updates.nome.trim();
            }
          }
        }

        // Se for aresta de corredor, atualizar nas arestas
        if (category === 'corredores' && this.routeEngine.adjList) {
          for (const [, edges] of this.routeEngine.adjList) {
            for (const edge of edges) {
              if (edge.featureId === key || edge.from === key || edge.to === key) {
                if (updates.acessivel !== undefined) edge.acessivel = Boolean(updates.acessivel);
                if (updates.ativo !== undefined && !updates.ativo) edge.acessivel = false;
              }
            }
          }
        }
      }

      // 4. Incrementar versão reativa para re-renderização imediata no Leaflet
      this.adminDataVersion++;

      // 5. Se houver rota traçada, recalcular
      if (this.hasRoute && this.originNodeId && this.destinationNodeId) {
        this.calculateRoute(false);
      }

      this.showNotification(`Item "${feat.properties.nome || key}" atualizado com sucesso!`, 'success');
    },

    /**
     * Restaura todas as sobreposições de administrador para os padrões originais
     */
    resetAdminOverrides() {
      try {
        localStorage.removeItem('totem_admin_overrides');
      } catch (e) {}
      this.adminOverrides = {};
      this.initApp();
      this.showNotification('Padrões de fábrica restaurados com sucesso!', 'info');
    },

    /**
     * Exporta os dados GeoJSON atualizados para download direto no navegador
     */
    exportGeoJSON(category = 'salas') {
      const data = this.geoData[category];
      if (!data) {
        this.showNotification(`Dataset "${category}" não disponível para exportação.`, 'error');
        return;
      }

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${category}_atualizado.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showNotification(`Arquivo ${category}_atualizado.geojson exportado!`, 'success');
    }
  }
});
