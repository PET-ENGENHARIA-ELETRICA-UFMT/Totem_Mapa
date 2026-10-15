<script setup>
import { computed, ref, watch } from 'vue';
import { useMainStore } from '../stores/mainStore.js';
import { debounce } from '../layers/logic/utils.js';

const store = useMainStore();

// Autocomplete local state
const isSuggestionsOpen = ref(false);
const searchInput = ref('');

// Sincroniza busca externa
watch(
  () => store.searchQuery,
  (val) => {
    searchInput.value = val;
  }
);

const onSearchInput = debounce((val) => {
  store.searchQuery = val;
  isSuggestionsOpen.value = val.trim().length > 0;
}, 250);

function handleSelectSuggestion(roomFeature) {
  isSuggestionsOpen.value = false;
  store.selectRoom(roomFeature);
}

function handleCategorySelect(category) {
  store.setActiveCategory(category);
}

function handleCategoryBack() {
  store.clearActiveCategory();
}

function handleRoomDetailBack() {
  store.clearRoomSelection();
}

function handleComoChegar() {
  const roomName = store.selectedRoomFeature?.properties?.nome;
  if (roomName) {
    store.setAsDestination(roomName);
  }
}

function handlePartirDaqui() {
  const roomName = store.selectedRoomFeature?.properties?.nome;
  if (roomName) {
    store.setAsOrigin(roomName);
  }
}

const categoryTitle = computed(() => {
  const titles = {
    sala: 'Salas',
    laboratório: 'Laboratórios',
    banheiro: 'Banheiros',
    secretaria: 'Secretarias',
    biblioteca: 'Biblioteca',
    auditório: 'Auditórios'
  };
  return titles[store.activeCategory] || store.activeCategory || 'Locais';
});

function getCategoryIconClass(category) {
  const icons = {
    sala: 'fa-solid fa-door-open',
    laboratório: 'fa-solid fa-flask',
    banheiro: 'fa-solid fa-restroom',
    secretaria: 'fa-solid fa-briefcase',
    biblioteca: 'fa-solid fa-book',
    auditório: 'fa-solid fa-users'
  };
  return icons[category] || 'fa-solid fa-location-dot';
}
</script>

<template>
  <aside
    id="sidebar"
    :class="[
      'absolute top-4 left-4 bottom-4 z-[1000] w-96 flex flex-col pointer-events-none transition-all duration-300',
      { collapsed: store.isSidebarCollapsed }
    ]"
  >
    <div
      class="bg-white/95 dark:bg-[#1a1f2e]/95 backdrop-blur-xl shadow-2xl rounded-3xl flex flex-col h-full border border-white/60 dark:border-white/10 pointer-events-auto overflow-hidden"
    >
      <!-- Sidebar Header -->
      <div
        class="p-5 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 relative"
      >
        <div class="flex items-center gap-3">
          <!-- Rounded square logo -->
          <div
            class="w-11 h-11 bg-blue-600 dark:bg-blue-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20"
          >
            <i class="fa-solid fa-map-location-dot text-xl"></i>
          </div>
          <div>
            <h1
              class="text-lg font-black text-slate-800 dark:text-white leading-tight tracking-tight"
            >
              Mapas FAET
            </h1>
            <p
              class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider"
            >
              Mapa Acessível - FAET/UFMT
            </p>
          </div>
        </div>
        <!-- Badge FAET -->
        <span
          class="px-2.5 py-1 text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200/50 dark:border-emerald-900/30"
        >
          FAET
        </span>
      </div>

      <!-- Tab Switcher -->
      <div
        class="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#111622]/50 p-1.5 gap-1 shrink-0"
      >
        <button
          id="tab-btn-info"
          type="button"
          :class="[
            'tab-btn flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2',
            store.activeTab === 'info'
              ? 'active'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
          ]"
          @click="store.setActiveTab('info')"
        >
          <i class="fa-solid fa-circle-info"></i>
          <span>Informações</span>
        </button>

        <button
          id="tab-btn-rotas"
          type="button"
          :class="[
            'tab-btn flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2',
            store.activeTab === 'rotas'
              ? 'active'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
          ]"
          @click="store.setActiveTab('rotas')"
        >
          <i class="fa-solid fa-route"></i>
          <span>Rotas</span>
        </button>
      </div>

      <!-- Sidebar Scrollable Content Container -->
      <div class="flex-1 overflow-y-auto min-h-0 bg-slate-50/30 dark:bg-slate-900/10">
        <!-- ABA INFORMAÇÕES -->
        <div v-show="store.activeTab === 'info'" class="p-5 flex flex-col gap-4">
          <!-- Search Input -->
          <div class="relative autocomplete-container shrink-0">
            <input
              id="sala-input"
              type="text"
              v-model="searchInput"
              @input="onSearchInput($event.target.value)"
              @focus="isSuggestionsOpen = searchInput.trim().length > 0"
              placeholder="Pesquisar local ou sala..."
              class="w-full bg-slate-100 dark:bg-[#111622] border border-transparent dark:border-slate-800 rounded-2xl px-5 py-3 pl-12 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:bg-white dark:focus:bg-[#1a1f2e] transition-all text-slate-700 dark:text-slate-200 font-semibold placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <i
              class="fa-solid fa-magnifying-glass absolute left-4 top-4 text-slate-400 dark:text-slate-500"
            ></i>

            <!-- Suggestions Container -->
            <div
              v-show="isSuggestionsOpen && store.filteredSalas.length > 0"
              class="absolute top-[110%] left-0 right-0 bg-white dark:bg-[#1a1f2e] shadow-2xl rounded-2xl overflow-hidden z-[1050] border border-slate-100 dark:border-slate-800 max-h-60 overflow-y-auto transition-all"
            >
              <div
                v-for="room in store.filteredSalas"
                :key="room.properties?.nome"
                @click="handleSelectSuggestion(room)"
                class="suggestion-item"
              >
                {{ room.properties?.nome }}
              </div>
            </div>
          </div>

          <!-- Category POI Selection Grid (Default view) -->
          <div
            v-if="!store.activeCategory && !store.selectedRoom"
            id="category-grid"
            class="flex flex-col gap-3"
          >
            <h3
              class="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500"
            >
              Categorias
            </h3>
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                @click="handleCategorySelect('sala')"
                class="category-card p-4 bg-white dark:bg-[#1a1f2e] hover:bg-slate-50 dark:hover:bg-[#252c3e] border border-slate-100 dark:border-slate-800 rounded-2xl text-left flex flex-col gap-2 transition-all shadow-sm group active:scale-95"
              >
                <div
                  class="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center"
                >
                  <i class="fa-solid fa-door-open"></i>
                </div>
                <span class="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  Salas
                </span>
              </button>

              <button
                type="button"
                @click="handleCategorySelect('laboratório')"
                class="category-card p-4 bg-white dark:bg-[#1a1f2e] hover:bg-slate-50 dark:hover:bg-[#252c3e] border border-slate-100 dark:border-slate-800 rounded-2xl text-left flex flex-col gap-2 transition-all shadow-sm group active:scale-95"
              >
                <div
                  class="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center"
                >
                  <i class="fa-solid fa-flask"></i>
                </div>
                <span class="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  Laboratórios
                </span>
              </button>

              <button
                type="button"
                @click="handleCategorySelect('banheiro')"
                class="category-card p-4 bg-white dark:bg-[#1a1f2e] hover:bg-slate-50 dark:hover:bg-[#252c3e] border border-slate-100 dark:border-slate-800 rounded-2xl text-left flex flex-col gap-2 transition-all shadow-sm group active:scale-95"
              >
                <div
                  class="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center"
                >
                  <i class="fa-solid fa-restroom"></i>
                </div>
                <span class="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  Banheiros
                </span>
              </button>

              <button
                type="button"
                @click="handleCategorySelect('secretaria')"
                class="category-card p-4 bg-white dark:bg-[#1a1f2e] hover:bg-slate-50 dark:hover:bg-[#252c3e] border border-slate-100 dark:border-slate-800 rounded-2xl text-left flex flex-col gap-2 transition-all shadow-sm group active:scale-95"
              >
                <div
                  class="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center"
                >
                  <i class="fa-solid fa-briefcase"></i>
                </div>
                <span class="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  Secretarias
                </span>
              </button>

              <button
                type="button"
                @click="handleCategorySelect('biblioteca')"
                class="category-card p-4 bg-white dark:bg-[#1a1f2e] hover:bg-slate-50 dark:hover:bg-[#252c3e] border border-slate-100 dark:border-slate-800 rounded-2xl text-left flex flex-col gap-2 transition-all shadow-sm group active:scale-95"
              >
                <div
                  class="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center"
                >
                  <i class="fa-solid fa-book"></i>
                </div>
                <span class="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  Biblioteca
                </span>
              </button>

              <button
                type="button"
                @click="handleCategorySelect('auditório')"
                class="category-card p-4 bg-white dark:bg-[#1a1f2e] hover:bg-slate-50 dark:hover:bg-[#252c3e] border border-slate-100 dark:border-slate-800 rounded-2xl text-left flex flex-col gap-2 transition-all shadow-sm group active:scale-95"
              >
                <div
                  class="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"
                >
                  <i class="fa-solid fa-users"></i>
                </div>
                <span class="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  Auditórios
                </span>
              </button>
            </div>
          </div>

          <!-- Category Items Listing View -->
          <div
            v-if="store.activeCategory && !store.selectedRoom"
            id="category-list-view"
            class="flex flex-col gap-3"
          >
            <div class="flex items-center gap-3">
              <button
                type="button"
                @click="handleCategoryBack"
                class="w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors"
              >
                <i class="fa-solid fa-arrow-left"></i>
              </button>
              <h3
                class="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-200"
              >
                {{ categoryTitle }}
              </h3>
            </div>

            <div class="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
              <div
                v-if="store.categoryItems.length === 0"
                class="text-xs font-semibold text-slate-400 p-4 text-center"
              >
                Nenhum local encontrado nesta categoria.
              </div>

              <div
                v-for="item in store.categoryItems"
                :key="item.properties?.nome"
                @click="store.selectRoom(item)"
                class="flex items-center justify-between p-3.5 bg-white dark:bg-[#1a1f2e] border border-slate-100 dark:border-slate-800/80 rounded-2xl hover:bg-slate-50 dark:hover:bg-[#252c3e] cursor-pointer transition-all active:scale-[0.98]"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
                  >
                    <i :class="getCategoryIconClass(store.activeCategory)"></i>
                  </div>
                  <div>
                    <span
                      class="text-sm font-extrabold text-slate-800 dark:text-slate-200 block leading-tight"
                    >
                      {{ item.properties?.nome }}
                    </span>
                    <span
                      class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-0.5 block"
                    >
                      {{ item.properties?.bloco || 'FAET' }} —
                      {{ item.properties?.andar === '0' ? 'Térreo' : `${item.properties?.andar}º Andar` }}
                    </span>
                  </div>
                </div>
                <i class="fa-solid fa-chevron-right text-xs text-slate-300 dark:text-slate-600 pr-1"></i>
              </div>
            </div>
          </div>

          <!-- Detailed POI Info Card -->
          <div
            v-if="store.selectedRoomFeature"
            id="room-detail-card"
            class="bg-white dark:bg-[#1a1f2e] border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col"
          >
            <div class="relative h-44 w-full bg-slate-100 dark:bg-slate-800">
              <img
                :src="store.selectedRoomFeature.properties?.imagem || 'https://placehold.co/400x200/eeeeee/cccccc?text=Sem+Imagem'"
                :alt="store.selectedRoomFeature.properties?.nome"
                class="w-full h-full object-cover"
              />
              <button
                type="button"
                @click="handleRoomDetailBack"
                class="absolute top-3 left-3 w-8 h-8 bg-black/50 hover:bg-black/75 text-white rounded-full flex items-center justify-center transition-all"
              >
                <i class="fa-solid fa-arrow-left text-xs"></i>
              </button>
            </div>
            <div class="p-5 flex flex-col gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <h2
                    class="text-lg font-black text-slate-800 dark:text-white tracking-tight"
                  >
                    {{ store.selectedRoomFeature.properties?.nome }}
                  </h2>
                </div>
                <div class="flex flex-wrap gap-2 mt-2">
                  <span
                    class="px-2 py-0.5 text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-md border border-blue-100 dark:border-blue-900/30"
                  >
                    Bloco {{ (store.selectedRoomFeature.properties?.bloco || 'FAET').toUpperCase() }}
                  </span>
                  <span
                    class="px-2 py-0.5 text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md"
                  >
                    {{ store.selectedRoomFeature.properties?.andar === '0' ? 'Térreo' : `${store.selectedRoomFeature.properties?.andar}º Andar` }}
                  </span>
                  <span
                    :class="[
                      'px-2 py-0.5 text-[10px] font-extrabold rounded-md border',
                      store.selectedRoomFeature.properties?.acessivel || store.selectedRoomFeature.properties?.acessibilidade === 'true'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30'
                    ]"
                  >
                    {{ store.selectedRoomFeature.properties?.acessivel || store.selectedRoomFeature.properties?.acessibilidade === 'true' ? 'Rota Acessível' : 'Escadas Apenas' }}
                  </span>
                </div>
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                <p>
                  {{ store.selectedRoomFeature.properties?.descricao || `Ambiente estruturado para atividades acadêmicas do curso. Tipo: ${store.selectedRoomFeature.properties?.tipo || 'Sala'}.` }}
                </p>
              </div>
              <div class="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  @click="handleComoChegar"
                  class="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                >
                  <i class="fa-solid fa-location-arrow"></i>
                  <span>Como Chegar</span>
                </button>
                <button
                  type="button"
                  @click="handlePartirDaqui"
                  class="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                >
                  <i class="fa-solid fa-flag"></i>
                  <span>Partir Daqui</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ABA ROTAS -->
        <div v-show="store.activeTab === 'rotas'" class="p-5 flex flex-col gap-4">
          <!-- Route Inputs -->
          <div
            class="space-y-2 relative bg-white dark:bg-[#1a1f2e] p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800"
          >
            <div
              class="absolute left-[1.6rem] top-10 bottom-10 w-[2px] border-l-2 border-dashed border-slate-200 dark:border-slate-800 z-0"
            ></div>

            <div class="relative z-10 flex items-center gap-3">
              <div
                class="w-4 h-4 rounded-full border-[4px] border-blue-500 bg-white dark:bg-[#1a1f2e] shadow-sm ml-2.5"
              ></div>
              <div class="flex-1">
                <span
                  class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block"
                >
                  Ponto de Partida
                </span>
                <select
                  id="select-origin"
                  v-model="store.originNodeId"
                  @change="store.calculateRoute()"
                  class="w-full bg-transparent border-none py-1 text-sm font-extrabold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value="" class="dark:bg-[#1e293b]">Escolher o ponto de partida...</option>
                  <option
                    v-for="node in store.routableNodes"
                    :key="'orig_' + node.id"
                    :value="node.id"
                    class="dark:bg-[#1e293b]"
                  >
                    {{ node.nome }} ({{ node.andar === '0' ? 'Térreo' : `${node.andar}º Andar` }})
                  </option>
                </select>
              </div>
            </div>

            <div class="w-full h-[1px] bg-slate-100 dark:bg-slate-800/80 my-2"></div>

            <div class="relative z-10 flex items-center gap-3">
              <div class="w-4 h-4 rounded-full bg-rose-500 shadow-sm ml-2.5"></div>
              <div class="flex-1">
                <span
                  class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block"
                >
                  Destino
                </span>
                <select
                  id="select-destination"
                  v-model="store.destinationNodeId"
                  @change="store.calculateRoute()"
                  class="w-full bg-transparent border-none py-1 text-sm font-extrabold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value="" class="dark:bg-[#1e293b]">Ex: Secretaria, Biblioteca...</option>
                  <option
                    v-for="node in store.routableNodes"
                    :key="'dest_' + node.id"
                    :value="node.id"
                    class="dark:bg-[#1e293b]"
                  >
                    {{ node.nome }} ({{ node.andar === '0' ? 'Térreo' : `${node.andar}º Andar` }})
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Preference switch (Acessível | Padrão) -->
          <div
            class="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-[#1a1f2e] border border-slate-100 dark:border-slate-800"
          >
            <span
              class="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider"
            >
              Preferência de Rota
            </span>
            <div
              class="bg-slate-100 dark:bg-[#111622] p-1 rounded-xl flex gap-1 border border-slate-200/50 dark:border-slate-800/30 shrink-0"
            >
              <button
                type="button"
                @click="store.setAccessiblePreference(true)"
                :class="[
                  'px-3.5 py-1.5 text-xs font-black rounded-lg transition-all active:scale-95',
                  store.isAccessible
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                ]"
              >
                Acessível
              </button>
              <button
                type="button"
                @click="store.setAccessiblePreference(false)"
                :class="[
                  'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all active:scale-95',
                  !store.isAccessible
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                ]"
              >
                Padrão
              </button>
            </div>
          </div>

          <!-- Action Button: Calcular Rota -->
          <button
            id="btn-calculate"
            type="button"
            @click="store.calculateRoute()"
            class="w-full bg-[#82c91e] hover:bg-[#74b816] text-[#1a3300] font-black py-4 rounded-2xl transition-all shadow-lg shadow-[#82c91e]/20 flex items-center justify-center gap-2.5 text-sm uppercase tracking-wider active:scale-[0.98]"
          >
            <i class="fa-solid fa-paper-plane"></i>
            <span>Calcular rota</span>
          </button>

          <!-- Action Button: Limpar Caminho -->
          <button
            id="limpar-btn"
            type="button"
            @click="store.clearRoute()"
            class="w-full bg-slate-200/80 hover:bg-slate-300/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-600 dark:text-slate-300 font-extrabold py-3 rounded-2xl transition-all text-xs uppercase tracking-wider"
          >
            Limpar Caminho
          </button>

          <!-- Route Options Selector (when alternatives exist) -->
          <div
            v-if="store.hasAlternatives"
            id="route-alternatives-selector"
            class="flex flex-col gap-2 bg-white dark:bg-[#1a1f2e] p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm"
          >
            <span
              class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block"
            >
              Opções de Rota ({{ store.routes.length }})
            </span>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="(r, idx) in store.routes"
                :key="r.id"
                type="button"
                @click="store.selectRoute(idx)"
                :class="[
                  'p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between gap-1 active:scale-95',
                  store.selectedRouteIndex === idx
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'bg-slate-50/70 dark:bg-[#111622]/60 border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                ]"
              >
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[10px] font-black uppercase tracking-tight">
                    {{ r.isPrimary ? 'Mais Rápida' : `Alternativa ${idx}` }}
                  </span>
                  <span
                    v-if="r.isPrimary"
                    class="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  >
                    ★
                  </span>
                </div>
                <div class="text-xs font-black text-slate-800 dark:text-slate-100">
                  {{ r.totalDistance }} m
                </div>
              </button>
            </div>
          </div>

          <!-- Route Result Details Card -->
          <div
            v-if="store.hasRoute"
            id="route-result-card"
            class="bg-white dark:bg-[#1a1f2e] p-4 rounded-2xl border border-slate-100 dark:border-slate-800 mt-1 shadow-sm"
          >
            <div class="flex items-start gap-3">
              <div
                class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0"
              >
                <i
                  :class="[
                    'text-lg',
                    store.isAccessible ? 'fa-solid fa-wheelchair' : 'fa-solid fa-person-walking'
                  ]"
                ></i>
              </div>
              <div class="min-w-0 flex-1">
                <p
                  class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider"
                >
                  {{ store.activeRoute?.isPrimary ? 'Rota Principal' : `Rota Alternativa ${store.selectedRouteIndex}` }}
                </p>
                <h5
                  class="text-sm font-extrabold text-slate-800 dark:text-white mt-0.5 leading-snug"
                >
                  {{
                    store.isAccessible
                      ? 'Rota acessível (sem escadas, priorizando rampas e elevador)'
                      : 'Rota padrão de pedestre (pode conter escadas)'
                  }}
                </h5>
                <div
                  class="flex items-center gap-2 mt-1.5 text-xs font-black text-blue-600 dark:text-blue-400"
                >
                  <span>{{ store.remainingTime }} min</span>
                  <span class="text-slate-300 dark:text-slate-700">•</span>
                  <span>{{ store.remainingDistance }} m</span>
                </div>
              </div>
            </div>

            <!-- Detailed instructions list -->
            <div
              class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 max-h-60 overflow-y-auto pr-1"
            >
              <ul id="list-instructions" class="space-y-3 text-xs font-semibold">
                <li
                  v-for="(inst, idx) in store.navigation.instructions"
                  :key="'step_' + idx"
                  class="flex items-start gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div
                    class="w-7 h-7 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 text-xs mt-0.5 shadow-sm border border-blue-100/50 dark:border-blue-900/30"
                  >
                    <i :class="inst.icon || 'fa-solid fa-location-arrow'"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug">
                      {{ inst.instruction }}
                    </p>
                    <span
                      v-if="inst.distance > 0"
                      class="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 block mt-0.5"
                    >
                      {{ inst.distance }} m
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Collapse/Expand handle for Sidebar -->
    <button
      id="sidebar-toggle-btn"
      type="button"
      @click="store.toggleSidebar"
      class="absolute left-full top-6 z-[1000] w-10 h-10 bg-white dark:bg-[#1a1f2e] shadow-lg rounded-r-xl border-y border-r border-slate-100 dark:border-slate-800/80 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all pointer-events-auto active:scale-95"
    >
      <i
        id="sidebar-toggle-icon"
        :class="[
          'fa-solid text-sm transition-transform duration-300',
          store.isSidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'
        ]"
      ></i>
    </button>
  </aside>
</template>
