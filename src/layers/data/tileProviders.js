/**
 * Camada de Dados: tileProviders.js
 * Catálogo centralizado de provedores de tiles (camadas base / "tylers") para o mapa Leaflet.
 * Inclui configurações de maxNativeZoom para permitir super zoom sem perda de visualização.
 */

export const TILE_PROVIDERS = {
  'carto-positron': {
    id: 'carto-positron',
    name: 'Carto Claro (Positron)',
    tag: 'Padrão Recomendado',
    category: 'Claro',
    desc: 'Visual minimalista, limpo e de alto contraste, ideal para navegação interna.',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    icon: 'fa-sun',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    previewBg: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    previewBorder: '#cbd5e1'
  },
  'google-hybrid': {
    id: 'google-hybrid',
    name: 'Google Satélite Híbrido',
    tag: 'Satélite HD',
    category: 'Satélite',
    desc: 'Imagens aéreas em alta resolução combinadas com vias e referências.',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: '0123',
    maxNativeZoom: 20,
    attribution: '&copy; Google Maps',
    icon: 'fa-satellite',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    previewBg: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
    previewBorder: '#059669'
  },
  'esri-satellite': {
    id: 'esri-satellite',
    name: 'Satélite Esri (Foto Aérea)',
    tag: 'Aéreo Puro',
    category: 'Satélite',
    desc: 'Fotografia orbital limpa sem textos sobrepostos, ótima para ver o campus.',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: '',
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Maxar, Earthstar Geographics',
    icon: 'fa-earth-americas',
    badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
    previewBg: 'linear-gradient(135deg, #134e4a 0%, #042f2e 100%)',
    previewBorder: '#0d9488'
  },
  'osm-standard': {
    id: 'osm-standard',
    name: 'OpenStreetMap',
    tag: 'Vias & Ruas',
    category: 'Ruas',
    desc: 'Cartografia colaborativa com traçado detalhado de vias e quadras.',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    icon: 'fa-map-location-dot',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    previewBg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    previewBorder: '#f59e0b'
  },
  'carto-dark': {
    id: 'carto-dark',
    name: 'Carto Dark Matter',
    tag: 'Modo Noturno',
    category: 'Escuro',
    desc: 'Visual escuro premium, realça o traçado das rotas e salas em neon.',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    icon: 'fa-moon',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    previewBg: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
    previewBorder: '#6366f1'
  },
  'carto-voyager': {
    id: 'carto-voyager',
    name: 'Carto Voyager (Colorido)',
    tag: 'Urbano Colorido',
    category: 'Colorido',
    desc: 'Cores vibrantes para áreas verdes, edifícios e malha viária.',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    icon: 'fa-compass',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    previewBg: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
    previewBorder: '#f43f5e'
  }
};

export const DEFAULT_TILE_PROVIDER_ID = 'carto-positron';

export const ZOOM_LEVEL_OPTIONS = [
  { value: 21, label: '21x — Padrão', desc: 'Aproximação recomendada para visualização geral' },
  { value: 23, label: '23x — Próximo', desc: 'Permite distinguir portas, corredores e salas' },
  { value: 25, label: '25x — Super Zoom', desc: 'Máxima aproximação com escalonamento nítido' },
  { value: 26, label: '26x — Ultra Detalhe', desc: 'Zoom extremo para análise de pontos específicos' }
];
