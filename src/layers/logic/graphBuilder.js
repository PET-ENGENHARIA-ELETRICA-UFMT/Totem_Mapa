/**
 * Camada de Lógica: graphBuilder.js
 * Construtor do Grafo de Navegação Topológico com indexação precisa a 7 decimais,
 * conexão livre de obstáculos (obstacle-free) de salas (centroides) aos corredores
 * via projeção perpendicular da porta com prevenção estrita de travessia de salas,
 * subdivisão de corredores em múltiplos andares e unificação da lista de locations.
 */

import {
  calculateDistance,
  calculateCentroid,
  findNearestNode,
  formatLocationName,
  distToSegment,
  segmentCrossesPolygon
} from './spatialUtils.js';

export class GraphBuilder {
  constructor() {
    this.nodes = new Map();
    this.corridorNodes = new Map();
    this.adjList = new Map();
    this.edges = [];
    this.coordToNodeMap = new Map();
    this.locations = [];
  }

  /**
   * Converte coordenadas geográficas para chave de precisão fixa a 7 casas decimais
   * @param {number} lon 
   * @param {number} lat 
   * @param {string|number} andar 
   * @returns {string}
   */
  getCoordKey(lon, lat, andar) {
    return `${Number(lon).toFixed(7)},${Number(lat).toFixed(7)}@${String(andar)}`;
  }

  /**
   * Registra um nó no grafo se ainda não existir
   */
  addNode(node) {
    if (!this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      this.adjList.set(node.id, []);
    }
    const registered = this.nodes.get(node.id);
    const coordKey = this.getCoordKey(node.lng, node.lat, node.andar);
    if (!this.coordToNodeMap.has(coordKey)) {
      this.coordToNodeMap.set(coordKey, node.id);
    }
    if (node.isCorridorPoint) {
      this.corridorNodes.set(node.id, registered);
    }
    return registered;
  }

  /**
   * Adiciona uma aresta não-direcionada ao grafo
   */
  addEdge(fromId, toId, weight, edgeProps = {}) {
    if (fromId === toId) return;

    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    if (!fromNode || !toNode) return;

    const safeWeight = Math.max(0.01, Number(weight) || 1.0);
    const tipo = (edgeProps.tipo || 'corredor').toLowerCase();
    const acessivel = edgeProps.acessivel !== false && tipo !== 'escada';
    const andar = edgeProps.andar !== undefined ? String(edgeProps.andar) : fromNode.andar;

    const edgeForward = {
      from: fromId,
      to: toId,
      weight: safeWeight,
      tipo,
      acessivel,
      andar,
      bloco: edgeProps.bloco || fromNode.bloco || 'faet',
      featureId: edgeProps.featureId || null,
      isConnector: Boolean(edgeProps.isConnector)
    };

    const edgeBackward = {
      from: toId,
      to: fromId,
      weight: safeWeight,
      tipo,
      acessivel,
      andar,
      bloco: edgeProps.bloco || toNode.bloco || 'faet',
      featureId: edgeProps.featureId || null,
      isConnector: Boolean(edgeProps.isConnector)
    };

    if (!this.adjList.has(fromId)) this.adjList.set(fromId, []);
    if (!this.adjList.has(toId)) this.adjList.set(toId, []);

    // Evita arestas duplicadas exatamente com o mesmo vizinho
    const existingFwd = this.adjList.get(fromId).find((e) => e.to === toId);
    if (!existingFwd) {
      this.adjList.get(fromId).push(edgeForward);
      this.adjList.get(toId).push(edgeBackward);
      this.edges.push(edgeForward);
    }
  }

  /**
   * Registra ou recupera um nó de corredor a partir de coordenadas ou nome explícito
   */
  getOrCreateCorridorNode(lon, lat, andar, explicitName, featureProps = {}) {
    const coordKey = this.getCoordKey(lon, lat, andar);

    if (explicitName && String(explicitName).trim() !== '') {
      const namedId = String(explicitName).trim();

      if (this.nodes.has(namedId)) {
        const existingNode = this.nodes.get(namedId);
        this.coordToNodeMap.set(coordKey, namedId);
        this.corridorNodes.set(namedId, existingNode);
        return existingNode;
      }

      const formatted = formatLocationName(namedId);
      const newNode = {
        id: namedId,
        lat: Number(lat),
        lng: Number(lon),
        andar: String(andar),
        tipo: (featureProps.tipo || 'corredor').toLowerCase(),
        nome: formatted,
        rawName: namedId,
        bloco: featureProps.bloco || 'faet',
        acessivel: featureProps.acessivel !== false,
        isCorridorPoint: true
      };

      return this.addNode(newNode);
    }

    if (this.coordToNodeMap.has(coordKey)) {
      const existingId = this.coordToNodeMap.get(coordKey);
      const existingNode = this.nodes.get(existingId);
      this.corridorNodes.set(existingId, existingNode);
      return existingNode;
    }

    const genericId = `node_${Number(lon).toFixed(7)}_${Number(lat).toFixed(7)}_${andar}`;
    const newNode = {
      id: genericId,
      lat: Number(lat),
      lng: Number(lon),
      andar: String(andar),
      tipo: (featureProps.tipo || 'corredor').toLowerCase(),
      nome: `Ponto ${genericId}`,
      rawName: genericId,
      bloco: featureProps.bloco || 'faet',
      acessivel: featureProps.acessivel !== false,
      isCorridorPoint: true
    };

    return this.addNode(newNode);
  }

  /**
   * Constrói o grafo a partir dos dados de corredores, salas e pontos.
   * Garante:
   * 1. Rotas iniciam e terminam no centroide exato das salas.
   * 2. As rotas não atravessam nenhuma sala intermediária.
   * 3. Projeção de portas na malha de corredores com subdivisão contínua.
   * 
   * @param {Object} corredoresData 
   * @param {Object} salasData 
   * @param {Object} pontosData 
   */
  build(corredoresData, salasData, pontosData) {
    this.nodes.clear();
    this.corridorNodes.clear();
    this.adjList.clear();
    this.edges = [];
    this.coordToNodeMap.clear();
    this.locations = [];

    // Identificar todos os andares presentes no projeto
    const floorsSet = new Set(['0', '1', '2']);
    if (salasData && salasData.features) {
      salasData.features.forEach((f) => floorsSet.add(String(f.properties?.andar ?? 0)));
    }
    const allFloors = Array.from(floorsSet);

    // 1. Processar e estruturar segmentos de corredor por andar
    const rawSegments = [];
    if (corredoresData && corredoresData.features) {
      allFloors.forEach((floorStr) => {
        corredoresData.features.forEach((feature, featIdx) => {
          const props = feature.properties || {};
          if (props.ativo === false) return; // Ignora arestas inativas

          const geom = feature.geometry;
          if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) return;
          const coords = geom.coordinates;
          if (coords.length < 2) return;

          const tipo = (props.tipo || 'corredor').toLowerCase();
          const acessivel = props.acessivel !== false && tipo !== 'escada';
          const bloco = props.bloco || 'faet';
          const featureId = props.id || null;

          for (let i = 0; i < coords.length - 1; i++) {
            const p1 = coords[i];
            const p2 = coords[i + 1];

            // Manter IDs canônicos para piso 0 e com sufixo consistente para outros pisos
            const id1 =
              floorStr === '0'
                ? i === 0 && props.origem
                  ? props.origem
                  : `node_${Number(p1[0]).toFixed(7)}_${Number(p1[1]).toFixed(7)}_0`
                : i === 0 && props.origem
                  ? `${props.origem}_a${floorStr}`
                  : `node_${Number(p1[0]).toFixed(7)}_${Number(p1[1]).toFixed(7)}_a${floorStr}`;

            const id2 =
              floorStr === '0'
                ? i === coords.length - 2 && props.destino
                  ? props.destino
                  : `node_${Number(p2[0]).toFixed(7)}_${Number(p2[1]).toFixed(7)}_0`
                : i === coords.length - 2 && props.destino
                  ? `${props.destino}_a${floorStr}`
                  : `node_${Number(p2[0]).toFixed(7)}_${Number(p2[1]).toFixed(7)}_a${floorStr}`;

            const node1 = this.addNode({
              id: id1,
              lat: p1[1],
              lng: p1[0],
              andar: floorStr,
              tipo,
              acessivel,
              bloco,
              nome: formatLocationName(id1),
              rawName: id1,
              isCorridorPoint: true
            });

            const node2 = this.addNode({
              id: id2,
              lat: p2[1],
              lng: p2[0],
              andar: floorStr,
              tipo,
              acessivel,
              bloco,
              nome: formatLocationName(id2),
              rawName: id2,
              isCorridorPoint: true
            });

            rawSegments.push({
              id: `seg_${featIdx}_${i}_a${floorStr}`,
              p1,
              p2,
              node1,
              node2,
              andar: floorStr,
              tipo,
              acessivel,
              bloco,
              featureId,
              subPoints: []
            });
          }
        });
      });
    }

    // 2. Conectar transições verticais entre andares (escadas, elevadores, rampas)
    this.connectVerticalTransitionsAcrossFloors(allFloors);

    // 3. Processar Salas (Polygon ou MultiPolygon) com cálculo exato de centroide e prevenção de colisão
    if (salasData && salasData.features) {
      salasData.features.forEach((feature, idx) => {
        const props = feature.properties || {};
        const roomName = props.nome || `Sala ${idx + 1}`;
        const andar = String(props.andar ?? 0);
        const tipo = (props.tipo || 'sala').toLowerCase();
        const bloco = props.bloco || 'faet';
        const acessivel = props.acessivel !== false;

        // Centroide geográfico exato
        const centroid = calculateCentroid(feature.geometry);
        const cLon = centroid[0];
        const cLat = centroid[1];

        // Anel perimetral da sala para amostragem de portas
        const ring =
          feature.geometry?.type === 'Polygon'
            ? feature.geometry.coordinates[0]
            : feature.geometry?.type === 'MultiPolygon'
            ? feature.geometry.coordinates[0]?.[0]
            : null;

        // Gerar candidatos a ponto de porta ao longo do perímetro da sala
        const doorCandidates = [];
        if (ring && ring.length >= 3) {
          for (let i = 0; i < ring.length - 1; i++) {
            for (const frac of [0.15, 0.3, 0.5, 0.7, 0.85]) {
              doorCandidates.push([
                ring[i][0] + (ring[i + 1][0] - ring[i][0]) * frac,
                ring[i][1] + (ring[i + 1][1] - ring[i][1]) * frac
              ]);
            }
          }
        }
        doorCandidates.push(centroid);

        // Segmentos de corredor no mesmo andar (ou fallback de andar)
        let floorSegs = rawSegments.filter((s) => s.andar === andar);
        if (floorSegs.length === 0) {
          floorSegs = rawSegments.filter((s) => s.andar === '0');
        }

        let bestConn = null;
        let minTotalDist = Infinity;

        // Testar candidatos a porta e sua projeção no corredor livre de obstáculos
        for (const door of doorCandidates) {
          // 1. Verificar se centroid -> door não corta outras salas no mesmo andar
          const dirCentroidX = door[0] - cLon;
          const dirCentroidY = door[1] - cLat;
          const doorInside = [cLon + dirCentroidX * 0.95, cLat + dirCentroidY * 0.95];

          let centroidCrosses = false;
          for (let oi = 0; oi < salasData.features.length; oi++) {
            if (oi === idx) continue;
            const other = salasData.features[oi];
            if (String(other.properties?.andar ?? 0) === andar) {
              const otherRing = other.geometry?.coordinates?.[0];
              if (segmentCrossesPolygon(centroid, doorInside, otherRing)) {
                centroidCrosses = true;
                break;
              }
            }
          }
          if (centroidCrosses) continue;

          // 2. Projetar no corredor e verificar se door -> proj não corta outras salas
          for (const seg of floorSegs) {
            const res = distToSegment(door[0], door[1], seg.p1[0], seg.p1[1], seg.p2[0], seg.p2[1]);
            const dirX = res.proj[0] - door[0];
            const dirY = res.proj[1] - door[1];
            const doorOutside = [door[0] + dirX * 0.05, door[1] + dirY * 0.05];

            let doorCrosses = false;
            for (let oi = 0; oi < salasData.features.length; oi++) {
              if (oi === idx) continue;
              const other = salasData.features[oi];
              if (String(other.properties?.andar ?? 0) === andar) {
                const otherRing = other.geometry?.coordinates?.[0];
                if (segmentCrossesPolygon(doorOutside, res.proj, otherRing)) {
                  doorCrosses = true;
                  break;
                }
              }
            }

            if (!doorCrosses) {
              const totalDist =
                Math.hypot(cLon - door[0], cLat - door[1]) +
                Math.hypot(door[0] - res.proj[0], door[1] - res.proj[1]);
              if (totalDist < minTotalDist) {
                minTotalDist = totalDist;
                bestConn = { door, proj: res.proj, seg, t: res.t };
              }
            }
          }
        }

        // Fallback seguro caso algum polígono complexo não passe no teste estrito
        if (!bestConn && floorSegs.length > 0) {
          let fallbackMinD = Infinity;
          for (const door of doorCandidates) {
            for (const seg of floorSegs) {
              const res = distToSegment(door[0], door[1], seg.p1[0], seg.p1[1], seg.p2[0], seg.p2[1]);
              if (res.d2 < fallbackMinD) {
                fallbackMinD = res.d2;
                bestConn = { door, proj: res.proj, seg, t: res.t };
              }
            }
          }
        }

        const safeName = roomName.replace(/\s+/g, '_').toLowerCase();
        const roomId = `sala_${safeName}_a${andar}_${idx}`;
        const doorId = `door_${safeName}_a${andar}_${idx}`;
        const projId = bestConn
          ? `proj_${Number(bestConn.proj[0]).toFixed(7)}_${Number(bestConn.proj[1]).toFixed(7)}_a${andar}`
          : `node_${Number(cLon).toFixed(7)}_${Number(cLat).toFixed(7)}_${andar}`;

        // 1. Nó da Sala (localizado exatamente no CENTROIDE)
        const roomNode = this.addNode({
          id: roomId,
          lat: cLat,
          lng: cLon,
          andar,
          tipo,
          nome: roomName,
          rawName: roomName,
          bloco,
          acessivel,
          isRoom: true,
          nearestNodeId: projId,
          feature
        });

        if (bestConn) {
          // 2. Nó da Porta (no limite perimetral livre)
          const doorNode = this.addNode({
            id: doorId,
            lat: bestConn.door[1],
            lng: bestConn.door[0],
            andar,
            tipo: 'porta',
            nome: `Porta ${roomName}`,
            rawName: doorId,
            bloco,
            acessivel: true,
            isDoor: true
          });

          // 3. Nó de Projeção no Corredor
          const projNode = this.addNode({
            id: projId,
            lat: bestConn.proj[1],
            lng: bestConn.proj[0],
            andar,
            tipo: 'corredor',
            nome: `Acesso Corredor ${roomName}`,
            rawName: projId,
            bloco,
            acessivel: true,
            isCorridorPoint: true
          });

          // Aresta Centroide <-> Porta (dentro da sala)
          const dCentroidDoor = calculateDistance(roomNode.lat, roomNode.lng, doorNode.lat, doorNode.lng);
          this.addEdge(roomId, doorId, dCentroidDoor, {
            tipo: 'sala',
            acessivel: true,
            andar,
            bloco,
            isConnector: true
          });

          // Aresta Porta <-> Projeção Corredor (acesso sem cruzar salas)
          const dDoorProj = calculateDistance(doorNode.lat, doorNode.lng, projNode.lat, projNode.lng);
          this.addEdge(doorId, projId, dDoorProj, {
            tipo: 'corredor',
            acessivel: true,
            andar,
            bloco,
            isConnector: true
          });

          // Registrar projeção para subdivisão do segmento de corredor
          bestConn.seg.subPoints.push({
            t: bestConn.t,
            proj: bestConn.proj,
            nodeId: projId,
            node: projNode
          });
        }

        feature.properties.nearestNodeId = projId;
        feature.properties.centroid = centroid;
      });
    }

    // 4. Processar Pontos de Interesse (POIs: elevadores, banheiros, etc.)
    if (pontosData && pontosData.features) {
      pontosData.features.forEach((feature, idx) => {
        const props = feature.properties || {};
        const poiName = props.nome || `POI ${idx + 1}`;
        const andar = String(props.andar ?? 0);
        const tipo = (props.tipo || 'poi').toLowerCase();
        const bloco = props.bloco || 'faet';
        const acessivel = props.acessivel !== false;

        const coords = feature.geometry?.coordinates;
        if (!coords || coords.length < 2) return;

        const pLon = coords[0];
        const pLat = coords[1];

        // Elevadores atendem a todos os andares do edifício
        const targetFloors = tipo === 'elevador' ? allFloors : [andar];

        targetFloors.forEach((fl) => {
          let floorSegs = rawSegments.filter((s) => s.andar === fl);
          if (floorSegs.length === 0) floorSegs = rawSegments.filter((s) => s.andar === '0');

          let bestSeg = null;
          let bestProj = null;
          let minD = Infinity;

          floorSegs.forEach((seg) => {
            const res = distToSegment(pLon, pLat, seg.p1[0], seg.p1[1], seg.p2[0], seg.p2[1]);
            if (res.d2 < minD) {
              minD = res.d2;
              bestSeg = seg;
              bestProj = res;
            }
          });

          const safeName = poiName.replace(/\s+/g, '_').toLowerCase();
          const poiId =
            tipo === 'elevador'
              ? `elevador_${bloco.toLowerCase()}_a${fl}`
              : `poi_${safeName}_a${fl}_${idx}`;

          const flLabel = fl === '0' ? 'Térreo' : `${fl}º Andar`;
          const poiNome =
            tipo === 'elevador'
              ? `Elevador ${bloco.toUpperCase()} (${flLabel})`
              : formatLocationName(poiName);

          const projId = bestProj
            ? `proj_${Number(bestProj.proj[0]).toFixed(7)}_${Number(bestProj.proj[1]).toFixed(7)}_a${fl}`
            : null;

          const poiNode = this.addNode({
            id: poiId,
            lat: pLat,
            lng: pLon,
            andar: fl,
            tipo,
            nome: poiNome,
            rawName: poiName,
            bloco,
            acessivel: true,
            isPoi: true,
            isElevator: tipo === 'elevador',
            nearestNodeId: projId,
            feature
          });

          if (bestProj && bestSeg) {
            const projNode = this.addNode({
              id: projId,
              lat: bestProj.proj[1],
              lng: bestProj.proj[0],
              andar: fl,
              tipo: 'corredor',
              nome: `Acesso Corredor ${poiNome}`,
              rawName: projId,
              bloco,
              acessivel: true,
              isCorridorPoint: true
            });

            const distToProj = calculateDistance(pLat, pLon, projNode.lat, projNode.lng);
            this.addEdge(poiId, projId, distToProj, {
              tipo: 'corredor',
              acessivel: true,
              andar: fl,
              bloco,
              isConnector: true
            });

            const dToNode1 = calculateDistance(projNode.lat, projNode.lng, bestSeg.node1.lat, bestSeg.node1.lng);
            const dToNode2 = calculateDistance(projNode.lat, projNode.lng, bestSeg.node2.lat, bestSeg.node2.lng);
            this.addEdge(projId, bestSeg.node1.id, dToNode1, {
              tipo: 'corredor',
              acessivel: true,
              andar: fl,
              bloco
            });
            this.addEdge(projId, bestSeg.node2.id, dToNode2, {
              tipo: 'corredor',
              acessivel: true,
              andar: fl,
              bloco
            });
          }
        });

        // Conectar elevadores verticalmente entre andares
        if (tipo === 'elevador') {
          for (let fi = 0; fi < allFloors.length; fi++) {
            for (let fj = fi + 1; fj < allFloors.length; fj++) {
              const f1 = allFloors[fi];
              const f2 = allFloors[fj];
              const id1 = `elevador_${bloco.toLowerCase()}_a${f1}`;
              const id2 = `elevador_${bloco.toLowerCase()}_a${f2}`;
              if (this.nodes.has(id1) && this.nodes.has(id2)) {
                const floorDiff = Math.abs(parseInt(f1) - parseInt(f2)) || 1;
                const cost = 10 + floorDiff * 6;
                this.addEdge(id1, id2, cost, {
                  tipo: 'elevador',
                  acessivel: true,
                  andar: f2,
                  vertical: true
                });
              }
            }
          }
        }
      });
    }

    // 5. Subdividir cada segmento de corredor por suas projeções coletadas
    rawSegments.forEach((seg) => {
      seg.subPoints.sort((a, b) => a.t - b.t);

      const chainNodes = [seg.node1];
      seg.subPoints.forEach((sp) => {
        const lastNode = chainNodes[chainNodes.length - 1];
        if (lastNode.id !== sp.nodeId) {
          chainNodes.push(sp.node);
        }
      });
      if (chainNodes[chainNodes.length - 1].id !== seg.node2.id) {
        chainNodes.push(seg.node2);
      }

      for (let i = 0; i < chainNodes.length - 1; i++) {
        const u = chainNodes[i];
        const v = chainNodes[i + 1];
        const d = calculateDistance(u.lat, u.lng, v.lat, v.lng);
        this.addEdge(u.id, v.id, d, {
          tipo: seg.tipo,
          acessivel: seg.acessivel,
          andar: seg.andar,
          bloco: seg.bloco,
          featureId: seg.featureId
        });
      }
    });

    // 6. Unificar Lista Única de Locations
    this.buildUnifiedLocations();

    return {
      nodes: this.nodes,
      corridorNodes: this.corridorNodes,
      adjList: this.adjList,
      edges: this.edges,
      locations: this.locations
    };
  }

  /**
   * Conecta nós de escadas, elevadores e rampas entre diferentes andares
   */
  connectVerticalTransitionsAcrossFloors(allFloors) {
    const verticalTypes = ['escada', 'elevador', 'rampa'];

    verticalTypes.forEach((vType) => {
      for (let i = 0; i < allFloors.length; i++) {
        for (let j = i + 1; j < allFloors.length; j++) {
          const f1 = allFloors[i];
          const f2 = allFloors[j];

          const nodesF1 = Array.from(this.nodes.values()).filter(
            (n) => n.andar === f1 && (n.tipo === vType || n.id.includes(vType) || n.id.includes('escada'))
          );
          const nodesF2 = Array.from(this.nodes.values()).filter(
            (n) => n.andar === f2 && (n.tipo === vType || n.id.includes(vType) || n.id.includes('escada'))
          );

          nodesF1.forEach((n1) => {
            nodesF2.forEach((n2) => {
              const dist = calculateDistance(n1.lat, n1.lng, n2.lat, n2.lng);
              if (dist <= 6.0) {
                const floorDiff = Math.abs(parseInt(f1) - parseInt(f2)) || 1;
                const cost = 12 + floorDiff * 8;
                this.addEdge(n1.id, n2.id, cost, {
                  tipo: vType,
                  acessivel: vType !== 'escada',
                  andar: f2,
                  vertical: true
                });
              }
            });
          });
        }
      }
    });
  }

  /**
   * Unifica pontos de corredor nomeados e salas em uma lista única de locations
   */
  buildUnifiedLocations() {
    const locationsList = [];
    const seenIds = new Set();

    // 1. Salas (com centroides exatos como coordinates)
    this.nodes.forEach((node) => {
      if (node.isRoom) {
        if (!seenIds.has(node.id)) {
          seenIds.add(node.id);
          locationsList.push({
            id: node.id,
            nome: node.nome,
            andar: node.andar,
            tipo: node.tipo || 'sala',
            bloco: node.bloco || 'faet',
            acessivel: node.acessivel,
            coordinates: [node.lng, node.lat],
            nearestNodeId: node.nearestNodeId,
            isRoom: true,
            feature: node.feature
          });
        }
      }
    });

    // 2. Pontos de corredor com nomes explícitos (ex: entrada_principal, saida_rodoviaria)
    this.corridorNodes.forEach((node) => {
      if (
        !node.id.startsWith('node_') &&
        !node.id.startsWith('proj_') &&
        !node.id.startsWith('door_')
      ) {
        if (!seenIds.has(node.id)) {
          seenIds.add(node.id);
          locationsList.push({
            id: node.id,
            nome: node.nome,
            andar: node.andar,
            tipo: node.tipo || 'corredor',
            bloco: node.bloco || 'faet',
            acessivel: node.acessivel,
            coordinates: [node.lng, node.lat],
            nearestNodeId: node.id,
            isRoom: false
          });
        }
      }
    });

    // 3. Pontos de Interesse (POIs)
    this.nodes.forEach((node) => {
      if (node.isPoi) {
        if (!seenIds.has(node.id)) {
          seenIds.add(node.id);
          locationsList.push({
            id: node.id,
            nome: node.nome,
            andar: node.andar,
            tipo: node.tipo || 'poi',
            bloco: node.bloco || 'faet',
            acessivel: node.acessivel,
            coordinates: [node.lng, node.lat],
            nearestNodeId: node.nearestNodeId,
            isPoi: true,
            isElevator: Boolean(node.isElevator || node.tipo === 'elevador'),
            feature: node.feature
          });
        }
      }
    });

    // Ordenação alfabética
    locationsList.sort((a, b) => a.nome.localeCompare(b.nome));

    this.locations = locationsList;
  }
}
