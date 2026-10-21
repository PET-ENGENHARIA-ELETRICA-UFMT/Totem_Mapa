/**
 * Camada de Lógica: engine.js
 * Fachada principal de navegação interna.
 * Integra GraphBuilder, DijkstraEngine e spatialUtils em uma arquitetura modular
 * desacoplada do DOM e da interface Leaflet.
 */

import {
  calculateDistance,
  findNearestNode,
  generateTurnByTurnInstructions,
  MAP_CONFIG
} from './spatialUtils.js';
import { GraphBuilder } from './graphBuilder.js';
import { DijkstraEngine } from './dijkstraEngine.js';

export class RouteEngine {
  /**
   * Construtor flexível que aceita tanto a nova assinatura (corredores, salas, pontos)
   * quanto a antiga (pontos, salas) com fallback automático.
   */
  constructor(arg1, arg2, arg3) {
    this.nodes = new Map();
    this.corridorNodes = new Map();
    this.adjList = new Map();
    this.edges = [];
    this.locations = [];
    this.dijkstraEngine = null;
    this.graphBuilder = new GraphBuilder();

    let corredores = null;
    let salas = null;
    let pontos = null;

    // Detectar datasets passados
    const args = [arg1, arg2, arg3].filter(Boolean);
    args.forEach((data) => {
      if (!data || !data.features || !data.features.length) return;
      const firstFeature = data.features[0];
      const geomType = firstFeature.geometry?.type;
      const props = firstFeature.properties || {};

      if (geomType === 'LineString' || props.origem || props.destino) {
        corredores = data;
      } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
        salas = data;
      } else if (geomType === 'Point') {
        pontos = data;
      }
    });

    if (corredores || salas) {
      this.buildGraph(corredores, salas, pontos);
    }
  }

  /**
   * Constrói o grafo e inicializa o motor de Dijkstra
   * @param {Object} corredoresData 
   * @param {Object} salasData 
   * @param {Object} pontosData 
   */
  buildGraph(corredoresData, salasData, pontosData) {
    const result = this.graphBuilder.build(corredoresData, salasData, pontosData);
    this.nodes = result.nodes;
    this.corridorNodes = result.corridorNodes;
    this.adjList = result.adjList;
    this.edges = result.edges;
    this.locations = result.locations;

    this.dijkstraEngine = new DijkstraEngine(this.nodes, this.adjList);
    return this;
  }

  /**
   * Encontra todas as rotas (rota principal + alternativas viáveis)
   * @param {string} startNodeId 
   * @param {string} endNodeId 
   * @param {Object} options 
   * @param {boolean} options.accessibilityMode - True para rotas PCD (sem escadas)
   * @param {number} options.maxAlternatives - Quantidade máxima de rotas alternativas (3 a 5)
   * @returns {Array<Object>} Lista de rotas formatadas
   */
  findRoutes(startNodeId, endNodeId, options = {}) {
    if (!this.dijkstraEngine) return [];

    const accessibilityMode = Boolean(options.accessibilityMode);
    const maxAlternatives = options.maxAlternatives ?? 1;

    const startNode = this.nodes.get(startNodeId);
    const endNode = this.nodes.get(endNodeId);

    if (!startNode || !endNode) {
      return [];
    }

    const rawRoutes = this.dijkstraEngine.findAlternativeRoutes(startNodeId, endNodeId, {
      accessibilityMode,
      maxAlternatives,
      penaltyFactor: 2.5,
      maxDistanceMultiplier: 3.8
    });

    if (!rawRoutes || rawRoutes.length === 0) {
      return [];
    }

    const cappedRoutes = rawRoutes.slice(0, 1 + maxAlternatives);

    const startName = startNode.nome || 'Origem';
    const endName = endNode.nome || 'Destino';

    return cappedRoutes.map((route, index) => {
      const coordinates = route.path.map((node) => [node.lng, node.lat]);
      const floorsCovered = Array.from(new Set(route.path.map((node) => String(node.andar))));
      const instructions = generateTurnByTurnInstructions(route.path, startName, endName);

      return {
        id: `route_${index}_${route.isPrimary ? 'primary' : 'alt'}`,
        totalDistance: Math.round(route.totalDistance),
        coordinates,
        nodes: route.path,
        floorsCovered,
        instructions,
        isPrimary: Boolean(route.isPrimary)
      };
    });
  }

  /**
   * Atalho para calcular o melhor caminho (compatibilidade com versões anteriores)
   * @param {string} startNodeId 
   * @param {string} endNodeId 
   * @param {boolean} requireAccessible 
   * @returns {Array<Object>|null} Array de nós da rota principal
   */
  findPathByNodeIds(startNodeId, endNodeId, requireAccessible = false) {
    if (!this.dijkstraEngine) return null;
    const res = this.dijkstraEngine.findShortestPath(startNodeId, endNodeId, {
      accessibilityMode: requireAccessible
    });
    return res ? res.path : null;
  }

  /**
   * Atalho para calcular caminho a partir de coordenadas geográficas
   */
  findPathByCoords(startLat, startLng, startAndar, endNodeId, requireAccessible = false) {
    const nearest = this.findNearestNode(startLat, startLng, startAndar);
    if (!nearest) return null;
    return this.findPathByNodeIds(nearest.id, endNodeId, requireAccessible);
  }

  /**
   * Encontra nó mais próximo de coordenadas dadas com fallback de andar
   */
  findNearestNode(lat, lng, andar) {
    const result = findNearestNode(lat, lng, andar, this.nodes, true);
    return result ? result.node : null;
  }

  /**
   * Gera instruções textuais passo a passo para um caminho
   */
  generateInstructions(path, originName = '', destinationName = '') {
    return generateTurnByTurnInstructions(path, originName, destinationName);
  }

  /**
   * Calcula distância total em metros de uma rota
   */
  calculateTotalDistance(route, startIndex = 0) {
    if (!route || route.length <= 1) return 0;
    let total = 0;
    for (let i = startIndex; i < route.length - 1; i++) {
      total += calculateDistance(route[i].lat, route[i].lng, route[i + 1].lat, route[i + 1].lng);
    }
    return Math.round(total);
  }

  /**
   * Estima o tempo de caminhada em minutos
   */
  estimateWalkingTimeMinutes(distanceMeters) {
    return Math.max(1, Math.round(distanceMeters / MAP_CONFIG.navigation.WALKING_SPEED_MPS / 60));
  }
}
