/**
 * Camada de Lógica: dijkstraEngine.js
 * Fila de Prioridade em Binary Heap e Motor de Dijkstra com suporte a acessibilidade
 * e geração de rotas alternativas penalizadas.
 */

/**
 * Fila de Prioridade baseada em Binary Min-Heap
 */
export class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  get size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Adiciona um item à fila com uma dada prioridade
   * @param {any} item 
   * @param {number} priority 
   */
  enqueue(item, priority) {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * Remove e retorna o item de menor prioridade (menor custo)
   * @returns {Object|null} { item, priority }
   */
  dequeue() {
    if (this.isEmpty()) return null;
    const min = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.sinkDown(0);
    }
    return min;
  }

  /**
   * Borbulha o elemento para cima mantendo a propriedade de min-heap
   * @param {number} index 
   */
  bubbleUp(index) {
    const element = this.heap[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];

      if (element.priority >= parent.priority) break;

      this.heap[index] = parent;
      this.heap[parentIndex] = element;
      index = parentIndex;
    }
  }

  /**
   * Afunda o elemento para baixo mantendo a propriedade de min-heap
   * @param {number} index 
   */
  sinkDown(index) {
    const length = this.heap.length;
    const element = this.heap[index];

    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let swapIndex = null;

      if (leftChildIndex < length) {
        if (this.heap[leftChildIndex].priority < element.priority) {
          swapIndex = leftChildIndex;
        }
      }

      if (rightChildIndex < length) {
        if (
          (swapIndex === null && this.heap[rightChildIndex].priority < element.priority) ||
          (swapIndex !== null && this.heap[rightChildIndex].priority < this.heap[leftChildIndex].priority)
        ) {
          swapIndex = rightChildIndex;
        }
      }

      if (swapIndex === null) break;

      this.heap[index] = this.heap[swapIndex];
      this.heap[swapIndex] = element;
      index = swapIndex;
    }
  }
}

/**
 * Motor de Dijkstra com suporte a acessibilidade e cálculo de rotas alternativas
 */
export class DijkstraEngine {
  /**
   * @param {Map<string, Object>} nodesMap - Mapa de id -> nó
   * @param {Map<string, Array<Object>>} adjListMap - Lista de adjacência
   */
  constructor(nodesMap, adjListMap) {
    this.nodes = nodesMap || new Map();
    this.adjList = adjListMap || new Map();
  }

  /**
   * Retorna a chave canônica não-direcionada para uma aresta
   */
  getEdgeKey(u, v) {
    return u < v ? `${u}--${v}` : `${v}--${u}`;
  }

  /**
   * Executa o algoritmo de Dijkstra clássico com filtros e penalidades
   * @param {string} startNodeId 
   * @param {string} endNodeId 
   * @param {Object} options 
   * @param {boolean} options.accessibilityMode - True para desconsiderar escadas e trechos inacessíveis
   * @param {Map<string, number>} options.penalties - Multiplicadores de peso para arestas
   * @returns {Object|null} { path, totalDistance, edges }
   */
  findShortestPath(startNodeId, endNodeId, options = {}) {
    const accessibilityMode = Boolean(options.accessibilityMode);
    const penalties = options.penalties || new Map();

    const startNode = this.nodes.get(startNodeId);
    const endNode = this.nodes.get(endNodeId);

    if (!startNode || !endNode) {
      return null;
    }

    if (startNodeId === endNodeId) {
      return {
        path: [startNode],
        totalDistance: 0,
        edges: []
      };
    }

    const distances = new Map();
    const previous = new Map();
    const pq = new PriorityQueue();

    this.nodes.forEach((_, id) => {
      distances.set(id, Infinity);
    });

    distances.set(startNodeId, 0);
    pq.enqueue(startNodeId, 0);

    while (!pq.isEmpty()) {
      const { item: currentId, priority: currentDist } = pq.dequeue();

      if (currentDist > distances.get(currentId)) {
        continue;
      }

      if (currentId === endNodeId) {
        break;
      }

      const neighbors = this.adjList.get(currentId) || [];
      for (const edge of neighbors) {
        // Filtro de Acessibilidade: ignora escadas ou vias com acessivel === false
        if (accessibilityMode) {
          if (edge.tipo === 'escada' || edge.acessivel === false) {
            continue;
          }
        }

        const edgeKey = this.getEdgeKey(currentId, edge.to);
        const penalty = penalties.get(edgeKey) || 1.0;
        const effectiveWeight = edge.weight * penalty;
        const newDist = currentDist + effectiveWeight;

        if (newDist < (distances.get(edge.to) ?? Infinity)) {
          distances.set(edge.to, newDist);
          previous.set(edge.to, { from: currentId, edge });
          pq.enqueue(edge.to, newDist);
        }
      }
    }

    if (!previous.has(endNodeId)) {
      return null;
    }

    // Reconstrução do caminho
    const path = [];
    const usedEdges = [];
    let curr = endNodeId;
    let realTotalDistance = 0;

    while (curr) {
      path.unshift(this.nodes.get(curr));
      const step = previous.get(curr);
      if (!step) break;

      usedEdges.unshift(step.edge);
      realTotalDistance += step.edge.weight;
      curr = step.from;
    }

    return {
      path,
      totalDistance: Math.round(realTotalDistance * 10) / 10,
      edges: usedEdges
    };
  }

  /**
   * Descobre a rota principal e até 3 a 5 rotas alternativas penalizando arestas utilizadas
   * @param {string} startNodeId 
   * @param {string} endNodeId 
   * @param {Object} options 
   * @param {boolean} options.accessibilityMode 
   * @param {number} options.maxAlternatives 
   * @param {number} options.penaltyFactor 
   * @param {number} options.maxDistanceMultiplier 
   * @returns {Array<Object>} Lista de rotas ordenadas com flag isPrimary
   */
  findAlternativeRoutes(startNodeId, endNodeId, options = {}) {
    const accessibilityMode = Boolean(options.accessibilityMode);
    const maxAlternatives = options.maxAlternatives ?? 1;
    const penaltyFactor = options.penaltyFactor ?? 2.5;
    const maxDistanceMultiplier = options.maxDistanceMultiplier ?? 3.8;

    // 1. Rota Principal
    const primary = this.findShortestPath(startNodeId, endNodeId, {
      accessibilityMode,
      penalties: new Map()
    });

    if (!primary) {
      return [];
    }

    primary.isPrimary = true;
    const routes = [primary];
    const seenSignatures = new Set([this.getPathSignature(primary.path)]);
    const primaryDist = primary.totalDistance;

    const penalties = new Map();

    // 2. Descoberta incremental de rotas alternativas (no máximo maxAlternatives alternativas)
    const maxIterations = 12;
    for (let iter = 0; iter < maxIterations && (routes.length - 1) < maxAlternatives; iter++) {
      // Penalizar arestas do caminho mais recente
      const lastRoute = routes[routes.length - 1];
      for (let i = 0; i < lastRoute.path.length - 1; i++) {
        const u = lastRoute.path[i].id;
        const v = lastRoute.path[i + 1].id;
        const edgeKey = this.getEdgeKey(u, v);
        const currentPenalty = penalties.get(edgeKey) || 1.0;
        penalties.set(edgeKey, currentPenalty * penaltyFactor);
      }

      const candidate = this.findShortestPath(startNodeId, endNodeId, {
        accessibilityMode,
        penalties
      });

      if (!candidate) break;

      const sig = this.getPathSignature(candidate.path);
      if (seenSignatures.has(sig)) {
        continue;
      }

      // Descartar rotas excessivamente longas (> 3x a distância da rota principal)
      if (primaryDist > 0 && candidate.totalDistance > primaryDist * maxDistanceMultiplier) {
        break;
      }

      candidate.isPrimary = false;
      seenSignatures.add(sig);
      routes.push(candidate);
    }

    return routes;
  }

  /**
   * Gera uma assinatura única para um caminho
   */
  getPathSignature(path) {
    return path.map((n) => n.id).join('->');
  }
}
