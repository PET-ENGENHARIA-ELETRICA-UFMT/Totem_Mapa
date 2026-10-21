<script setup>
import { computed, ref } from 'vue';
import { useMainStore } from '../../stores/mainStore.js';

const store = useMainStore();

// Estados locais de filtro e busca
const searchQuery = ref('');
const selectedFloor = ref('all'); // 'all', '0', '1', '2'
const activeCategoryTab = ref('salas'); // 'salas', 'pontos', 'corredores'
const statusFilter = ref('all'); // 'all', 'active_only', 'disabled_only', 'accessible_only', 'inaccessible_only'

function handleClose() {
  store.closeAdminModal();
}

// Helpers para extração segura de propriedades
function getItemId(item) {
  return item.properties?.id || item.properties?.nome || item.id || '';
}

function getItemName(item) {
  return item.properties?.nome || item.properties?.id || item.nome || 'Sem Nome';
}

function getItemFloor(item) {
  return String(item.properties?.andar ?? item.andar ?? '0');
}

function getItemBloco(item) {
  return (item.properties?.bloco || item.bloco || 'FAET').toUpperCase();
}

function isItemActive(item) {
  const p = item.properties || item;
  if (p.ativo === false || String(p.ativo).toLowerCase() === 'false') return false;
  if (p.status_bloqueado === true || String(p.status_bloqueado).toLowerCase() === 'true') return false;
  if (p.tipo_uso === 'status_bloqueado') return false;
  return true;
}

function isItemAccessible(item) {
  const p = item.properties || item;
  if (p.acessivel === false || String(p.acessivel).toLowerCase() === 'false') return false;
  if (p.acessibilidade === 'false') return false;
  const tipo = (p.tipo || p.tipo_uso || '').toLowerCase();
  if (tipo === 'escada') return false;
  return true;
}

function getItemIcon(item, category) {
  const p = item.properties || item;
  const tipo = String(p.tipo || p.tipo_uso || '').toLowerCase();

  if (category === 'corredores') return 'fa-solid fa-route';
  if (tipo.includes('lab')) return 'fa-solid fa-flask';
  if (tipo.includes('banheiro')) return 'fa-solid fa-restroom';
  if (tipo.includes('elevador')) return 'fa-solid fa-elevator';
  if (tipo.includes('escada')) return 'fa-solid fa-stairs';
  if (tipo.includes('rampa')) return 'fa-solid fa-wheelchair';
  if (tipo.includes('totem')) return 'fa-solid fa-circle-info';
  if (tipo.includes('admin') || tipo.includes('secretaria')) return 'fa-solid fa-briefcase';
  if (tipo.includes('biblioteca')) return 'fa-solid fa-book';
  return 'fa-solid fa-door-open';
}

// Lista bruta de itens da categoria ativa
const rawItems = computed(() => {
  if (activeCategoryTab.value === 'salas') {
    return store.geoData.salas?.features || [];
  }
  if (activeCategoryTab.value === 'pontos') {
    return store.geoData.pontos?.features || [];
  }
  if (activeCategoryTab.value === 'corredores') {
    return store.geoData.corredores?.features || [];
  }
  return [];
});

// Estatísticas globais do painel
const stats = computed(() => {
  const salas = store.geoData.salas?.features || [];
  const pontos = store.geoData.pontos?.features || [];

  const totalSalas = salas.length;
  const salasBloqueadas = salas.filter((s) => !isItemActive(s)).length;
  const salasAcessiveis = salas.filter((s) => isItemAccessible(s)).length;

  const totalPontos = pontos.length;
  const pontosDesativados = pontos.filter((p) => !isItemActive(p)).length;

  return {
    totalSalas,
    salasBloqueadas,
    salasAtivas: totalSalas - salasBloqueadas,
    salasAcessiveis,
    totalPontos,
    pontosDesativados,
    pontosAtivos: totalPontos - pontosDesativados
  };
});

// Lista filtrada e buscada
const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const floor = selectedFloor.value;
  const status = statusFilter.value;

  return rawItems.value.filter((item) => {
    // Filtro por andar
    if (floor !== 'all' && getItemFloor(item) !== floor) {
      return false;
    }

    const active = isItemActive(item);
    const accessible = isItemAccessible(item);

    // Filtro de status
    if (status === 'active_only' && !active) return false;
    if (status === 'disabled_only' && active) return false;
    if (status === 'accessible_only' && !accessible) return false;
    if (status === 'inaccessible_only' && accessible) return false;

    // Filtro de busca textual
    if (q) {
      const name = getItemName(item).toLowerCase();
      const id = getItemId(item).toLowerCase();
      const bloco = getItemBloco(item).toLowerCase();
      const tipo = String(item.properties?.tipo_uso || item.properties?.tipo || '').toLowerCase();
      return name.includes(q) || id.includes(q) || bloco.includes(q) || tipo.includes(q);
    }

    return true;
  });
});

// Ações de alteração
function toggleItemActive(item) {
  const current = isItemActive(item);
  const targetId = getItemId(item);
  store.updateLocationProperty(activeCategoryTab.value, targetId, {
    ativo: !current
  });
}

function toggleItemAccessible(item) {
  const current = isItemAccessible(item);
  const targetId = getItemId(item);
  store.updateLocationProperty(activeCategoryTab.value, targetId, {
    acessivel: !current
  });
}

function focusOnMap(item) {
  const floor = getItemFloor(item);
  store.setFloor(floor);
  store.selectRoom(item, true);
  store.closeAdminModal();
}

function handleResetDefaults() {
  if (confirm('Deseja realmente restaurar todas as configurações e valores originais dos GeoJSONs?')) {
    store.resetAdminOverrides();
  }
}

function handleExport(category) {
  store.exportGeoJSON(category);
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="store.isAdminModalOpen"
      id="modal-admin-backdrop"
      class="fixed inset-0 z-[2050] flex items-center justify-center p-2.5 sm:p-5 md:p-6 bg-slate-950/75 backdrop-blur-md pointer-events-auto"
      @click.self="handleClose"
    >
      <div
        id="modal-admin-container"
        class="bg-white dark:bg-[#111726] border border-slate-200/80 dark:border-white/10 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col transform transition-all animate-scaleUp"
      >
        <!-- Modal Top Header -->
        <div
          class="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 bg-slate-50/90 dark:bg-white/[0.02]"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/15 text-amber-500 dark:text-amber-400 flex items-center justify-center font-bold text-lg border border-amber-500/30 shrink-0"
            >
              <i class="fa-solid fa-user-shield"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base sm:text-lg font-black text-slate-800 dark:text-white tracking-tight">
                  Painel do Administrador
                </h2>
                <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Gestão Topológica
                </span>
              </div>
              <p class="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                Controle o status de ativação, bloqueios temporários e acessibilidade (PCD)
              </p>
            </div>
          </div>

          <!-- Quick Action Buttons: Exportar e Restaurar -->
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="handleExport('salas')"
              title="Baixar salas.geojson atualizado"
              class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              <i class="fa-solid fa-download text-xs text-blue-500"></i>
              <span class="hidden sm:inline">Exportar Salas</span>
            </button>

            <button
              type="button"
              @click="handleExport('pontos')"
              title="Baixar pontos.geojson atualizado"
              class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              <i class="fa-solid fa-download text-xs text-purple-500"></i>
              <span class="hidden sm:inline">Exportar POIs</span>
            </button>

            <button
              type="button"
              @click="handleResetDefaults"
              title="Restaurar padrões de fábrica"
              class="px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-red-500/20 active:scale-95"
            >
              <i class="fa-solid fa-rotate-left text-xs"></i>
              <span class="hidden md:inline">Restaurar</span>
            </button>

            <button
              id="btn-close-admin-modal"
              type="button"
              @click="handleClose"
              class="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center transition-all shadow-sm active:scale-95 ml-1"
              title="Fechar"
            >
              <i class="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        <!-- KPI Summary Cards -->
        <div class="px-5 sm:px-6 py-3 bg-slate-50/50 dark:bg-white/[0.01] border-b border-slate-100 dark:border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div class="p-2.5 bg-white dark:bg-[#1a2234] rounded-2xl border border-slate-200/60 dark:border-white/5 flex items-center gap-2.5 shadow-sm">
            <div class="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
              <i class="fa-solid fa-door-open"></i>
            </div>
            <div>
              <span class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase block">Total Salas</span>
              <span class="text-sm font-black text-slate-800 dark:text-white leading-none">{{ stats.totalSalas }}</span>
            </div>
          </div>

          <div class="p-2.5 bg-white dark:bg-[#1a2234] rounded-2xl border border-slate-200/60 dark:border-white/5 flex items-center gap-2.5 shadow-sm">
            <div class="w-8 h-8 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center font-black text-xs shrink-0">
              <i class="fa-solid fa-ban"></i>
            </div>
            <div>
              <span class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase block">Bloqueadas</span>
              <span class="text-sm font-black text-red-600 dark:text-red-400 leading-none">{{ stats.salasBloqueadas }}</span>
            </div>
          </div>

          <div class="p-2.5 bg-white dark:bg-[#1a2234] rounded-2xl border border-slate-200/60 dark:border-white/5 flex items-center gap-2.5 shadow-sm">
            <div class="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-xs shrink-0">
              <i class="fa-solid fa-wheelchair"></i>
            </div>
            <div>
              <span class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase block">Acessíveis PCD</span>
              <span class="text-sm font-black text-emerald-600 dark:text-emerald-400 leading-none">{{ stats.salasAcessiveis }}</span>
            </div>
          </div>

          <div class="p-2.5 bg-white dark:bg-[#1a2234] rounded-2xl border border-slate-200/60 dark:border-white/5 flex items-center gap-2.5 shadow-sm">
            <div class="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black text-xs shrink-0">
              <i class="fa-solid fa-location-dot"></i>
            </div>
            <div>
              <span class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase block">Total POIs</span>
              <span class="text-sm font-black text-slate-800 dark:text-white leading-none">{{ stats.totalPontos }}</span>
            </div>
          </div>
        </div>

        <!-- Category Tabs -->
        <div class="px-5 sm:px-6 pt-3 flex items-center gap-2 border-b border-slate-100 dark:border-white/10 bg-slate-50/30 dark:bg-white/[0.01]">
          <button
            type="button"
            @click="activeCategoryTab = 'salas'"
            :class="[
              'px-4 py-2 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all border-b-2 flex items-center gap-2',
              activeCategoryTab === 'salas'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#111726]'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            ]"
          >
            <i class="fa-solid fa-door-open"></i>
            <span>Salas de Aula & Laboratórios ({{ store.geoData.salas?.features?.length || 0 }})</span>
          </button>

          <button
            type="button"
            @click="activeCategoryTab = 'pontos'"
            :class="[
              'px-4 py-2 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all border-b-2 flex items-center gap-2',
              activeCategoryTab === 'pontos'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#111726]'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            ]"
          >
            <i class="fa-solid fa-location-dot"></i>
            <span>Pontos de Interesse ({{ store.geoData.pontos?.features?.length || 0 }})</span>
          </button>

          <button
            type="button"
            @click="activeCategoryTab = 'corredores'"
            :class="[
              'px-4 py-2 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all border-b-2 flex items-center gap-2',
              activeCategoryTab === 'corredores'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#111726]'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            ]"
          >
            <i class="fa-solid fa-route"></i>
            <span>Vias & Corredores ({{ store.geoData.corredores?.features?.length || 0 }})</span>
          </button>
        </div>

        <!-- Filter & Search Controls Bar -->
        <div class="px-5 sm:px-6 py-3.5 border-b border-slate-100 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#111726]">
          <!-- Input de Busca -->
          <div class="relative flex-1 min-w-[200px] max-w-md">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <i class="fa-solid fa-magnifying-glass text-xs"></i>
            </span>
            <input
              type="text"
              v-model="searchQuery"
              placeholder="Buscar por nome, bloco, tipo ou ID..."
              class="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-[#182032] border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-extrabold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <!-- Filtro de Andares -->
          <div class="flex items-center gap-1 bg-slate-100 dark:bg-[#182032] p-1 rounded-xl border border-slate-200/80 dark:border-white/10 shrink-0">
            <button
              v-for="fl in [
                { id: 'all', label: 'Todos' },
                { id: '0', label: 'Térreo' },
                { id: '1', label: '1º Andar' },
                { id: '2', label: '2º Andar' }
              ]"
              :key="fl.id"
              type="button"
              @click="selectedFloor = fl.id"
              :class="[
                'px-2.5 py-1 text-[11px] font-black rounded-lg transition-all active:scale-95',
                selectedFloor === fl.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              ]"
            >
              {{ fl.label }}
            </button>
          </div>

          <!-- Filtro de Status -->
          <select
            v-model="statusFilter"
            class="px-3 py-2 bg-slate-100 dark:bg-[#182032] border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 outline-none cursor-pointer shrink-0"
          >
            <option value="all">Todos os Status</option>
            <option value="active_only">Apenas Ativos</option>
            <option value="disabled_only">Apenas Bloqueados / Desativados</option>
            <option value="accessible_only">Apenas Acessíveis (PCD)</option>
            <option value="inaccessible_only">Apenas Inacessíveis (Escadas)</option>
          </select>
        </div>

        <!-- Scrollable Component Items List -->
        <div class="p-4 sm:p-6 overflow-y-auto max-h-[52vh] space-y-2.5 custom-scrollbar bg-slate-50/40 dark:bg-[#0c101c]">
          <div
            v-if="filteredItems.length === 0"
            class="py-12 text-center text-slate-400 font-bold text-xs"
          >
            Nenhum item encontrado com os filtros selecionados.
          </div>

          <div
            v-for="item in filteredItems"
            :key="getItemId(item)"
            class="p-3.5 bg-white dark:bg-[#161d2d] border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-sm hover:border-blue-500/40 transition-all flex flex-wrap items-center justify-between gap-3"
          >
            <!-- Left Info Block -->
            <div class="flex items-center gap-3 min-w-[200px]">
              <div
                :class="[
                  'w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 border',
                  !isItemActive(item)
                    ? 'bg-red-500/10 text-red-500 border-red-500/30'
                    : isItemAccessible(item)
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                ]"
              >
                <i :class="getItemIcon(item, activeCategoryTab)"></i>
              </div>

              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                    {{ getItemName(item) }}
                  </span>
                  <span
                    v-if="!isItemActive(item)"
                    class="px-1.5 py-0.2 rounded-md bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 text-[9px] font-black uppercase border border-red-200 dark:border-red-900/40"
                  >
                    Bloqueado
                  </span>
                </div>
                <div class="flex items-center gap-1.5 mt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                  <span>{{ getItemBloco(item) }}</span>
                  <span>•</span>
                  <span>{{ getItemFloor(item) === '0' ? 'Térreo' : `${getItemFloor(item)}º Andar` }}</span>
                  <span v-if="item.properties?.tipo_uso || item.properties?.tipo">•</span>
                  <span v-if="item.properties?.tipo_uso || item.properties?.tipo" class="capitalize">
                    {{ item.properties?.tipo_uso || item.properties?.tipo }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Right Controls: Toggle Ativo, Toggle Acessível, Ver no Mapa -->
            <div class="flex items-center gap-3 ml-auto">
              <!-- TOGGLE: ATIVO / BLOQUEADO -->
              <div class="flex items-center gap-2 bg-slate-100 dark:bg-[#111726] px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-white/5">
                <span class="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">
                  Ativo
                </span>
                <button
                  type="button"
                  @click="toggleItemActive(item)"
                  :class="[
                    'w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out',
                    isItemActive(item) ? 'bg-emerald-500' : 'bg-red-500'
                  ]"
                  :title="isItemActive(item) ? 'Clique para Bloquear/Desativar' : 'Clique para Liberar/Ativar'"
                >
                  <div
                    :class="[
                      'bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out',
                      isItemActive(item) ? 'translate-x-5' : 'translate-x-0'
                    ]"
                  ></div>
                </button>
              </div>

              <!-- TOGGLE: ACESSÍVEL (PCD) -->
              <div class="flex items-center gap-2 bg-slate-100 dark:bg-[#111726] px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-white/5">
                <span class="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">
                  PCD
                </span>
                <button
                  type="button"
                  @click="toggleItemAccessible(item)"
                  :class="[
                    'w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out',
                    isItemAccessible(item) ? 'bg-blue-600' : 'bg-amber-500'
                  ]"
                  :title="isItemAccessible(item) ? 'Acessível PCD (sem escadas)' : 'Inacessível PCD (apenas escadas)'"
                >
                  <div
                    :class="[
                      'bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out',
                      isItemAccessible(item) ? 'translate-x-5' : 'translate-x-0'
                    ]"
                  ></div>
                </button>
              </div>

              <!-- BOTÃO FOCALIZAR NO MAPA -->
              <button
                type="button"
                @click="focusOnMap(item)"
                class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-all shadow-sm active:scale-90"
                title="Visualizar e focalizar este componente no mapa"
              >
                <i class="fa-solid fa-eye text-xs"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-3.5 border-t border-slate-100 dark:border-white/10 bg-slate-50/90 dark:bg-white/[0.02] flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>
            Exibindo <b>{{ filteredItems.length }}</b> de <b>{{ rawItems.length }}</b> componentes
          </span>
          <button
            type="button"
            @click="handleClose"
            class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
          >
            Concluir Edições
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}

@keyframes scaleUp {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.animate-scaleUp {
  animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
