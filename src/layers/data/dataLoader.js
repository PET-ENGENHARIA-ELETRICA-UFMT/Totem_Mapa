/**
 * Camada de Dados: dataLoader.js
 * Responsável exclusivamente pelo carregamento, validação e leitura de GeoJSONs / APIs.
 */

export const dataLoader = {
  /**
   * Valida se a estrutura básica de um GeoJSON está íntegra
   * @param {Object} data 
   * @param {string} label 
   * @returns {boolean}
   */
  validateGeoJSON(data, label = 'GeoJSON') {
    if (!data || typeof data !== 'object') {
      throw new Error(`Dados inválidos para ${label}: formato não reconhecido.`);
    }
    if (!data.features || !Array.isArray(data.features)) {
      throw new Error(`GeoJSON de ${label} não contém um array de features válido.`);
    }
    return true;
  },

  /**
   * Helper seguro para fetch com fallback de caminhos
   * @param {string[]} paths 
   * @returns {Promise<any>}
   */
  async fetchWithFallback(paths) {
    let lastError = null;
    for (const p of paths) {
      try {
        const response = await fetch(p);
        if (response.ok) {
          return await response.json();
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`Falha ao carregar dados em nenhuma das origens: [${paths.join(', ')}]. ${lastError?.message || ''}`);
  },

  /**
   * Helper para obter caminho base seguro (suporta GitHub Pages com subpastas)
   */
  getBasePath(relativeFile) {
    const base = import.meta.env.BASE_URL || './';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    const cleanFile = relativeFile.startsWith('/') ? relativeFile.slice(1) : relativeFile;
    return `${cleanBase}${cleanFile}`;
  },

  /**
   * Carrega os dados das salas
   */
  async loadSalas() {
    const data = await this.fetchWithFallback([
      this.getBasePath('data/salas.geojson'),
      this.getBasePath('salas.geojson'),
      './data/salas.geojson',
      './salas.geojson',
      '/data/salas.geojson',
      'assets/data/salas.geojson'
    ]);
    this.validateGeoJSON(data, 'salas');
    return data;
  },

  /**
   * Carrega os dados dos andares / polígonos base
   */
  async loadFloor() {
    const data = await this.fetchWithFallback([
      this.getBasePath('data/floor.geojson'),
      this.getBasePath('floor.geojson'),
      './data/floor.geojson',
      './floor.geojson',
      '/data/floor.geojson',
      'assets/data/floor.geojson'
    ]);
    this.validateGeoJSON(data, 'floor');
    return data;
  },

  /**
   * Carrega os pontos de interesse (escadas, elevadores, banheiros, etc.)
   */
  async loadPontos() {
    const data = await this.fetchWithFallback([
      this.getBasePath('data/pontos.geojson'),
      this.getBasePath('pontos.geojson'),
      './data/pontos.geojson',
      './pontos.geojson',
      '/data/pontos.geojson',
      'assets/data/pontos.geojson'
    ]);
    this.validateGeoJSON(data, 'pontos');
    return data;
  },

  /**
   * Carrega os dados dos corredores e vias de circulação
   */
  async loadCorredores() {
    const data = await this.fetchWithFallback([
      this.getBasePath('data/corredores.geojson'),
      this.getBasePath('corredores.geojson'),
      './data/corredores.geojson',
      './corredores.geojson',
      '/data/corredores.geojson',
      'assets/data/corredores.geojson'
    ]);
    this.validateGeoJSON(data, 'corredores');
    return data;
  },

  /**
   * Carrega todas as fontes de dados em paralelo
   */
  async loadAll() {
    const [salas, floor, pontos, corredores] = await Promise.all([
      this.loadSalas(),
      this.loadFloor(),
      this.loadPontos(),
      this.loadCorredores()
    ]);

    return {
      salas,
      floor,
      pontos,
      corredores
    };
  }
};
