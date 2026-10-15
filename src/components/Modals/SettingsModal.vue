<script setup>
import { computed } from 'vue';
import { useMainStore } from '../../stores/mainStore.js';
import { TILE_PROVIDERS, ZOOM_LEVEL_OPTIONS, DEFAULT_TILE_PROVIDER_ID } from '../../layers/data/tileProviders.js';

const store = useMainStore();

const tileProvidersList = computed(() => Object.values(TILE_PROVIDERS));

function handleClose() {
  store.closeSettingsModal();
}

function handleSelectTile(providerId) {
  store.setTileProvider(providerId);
}

function handleSetMaxZoom(level) {
  store.setMaxZoomLevel(level);
}

function handleFloorOpacityChange(event) {
  store.setFloorOpacity(event.target.value);
}

function setPresetOpacity(value) {
  store.setFloorOpacity(value);
}

function resetDefaults() {
  store.setTileProvider(DEFAULT_TILE_PROVIDER_ID);
  store.setMaxZoomLevel(25);
  store.setFloorOpacity(0.85);
  if (!store.tileSharpness) {
    store.toggleTileSharpness();
  }
  store.showNotification('Configurações redefinidas para o padrão!', 'info');
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
      v-if="store.isSettingsModalOpen"
      id="modal-settings-backdrop"
      class="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-md pointer-events-auto"
      @click.self="handleClose"
    >
      <div
        id="modal-settings-container"
        class="bg-white dark:bg-[#151a27] border border-slate-200/80 dark:border-white/10 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col transform transition-all animate-scaleUp"
      >
        <!-- Modal Header -->
        <div
          class="px-6 py-5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50/80 dark:bg-white/[0.02]"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-500/20"
            >
              <i class="fa-solid fa-sliders"></i>
            </div>
            <div>
              <h2 class="text-lg font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                Configurações do Mapa
                <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Visualização
                </span>
              </h2>
              <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                Altere o provedor de tiles (tyler), controle de zoom e preferências
              </p>
            </div>
          </div>

          <button
            id="btn-close-settings"
            type="button"
            @click="handleClose"
            class="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center transition-all shadow-sm active:scale-95"
            title="Fechar"
          >
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        <!-- Modal Scrollable Content -->
        <div class="p-6 overflow-y-auto space-y-7 custom-scrollbar">
          <!-- SEÇÃO 1: ESTILOS DE TILE ("TYLER" DO MAPA) -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <label class="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <i class="fa-solid fa-layer-group text-blue-500"></i>
                Estilo do Mapa / Provedor de Tiles (Tyler)
              </label>
              <span class="text-[11px] font-bold text-slate-400">
                {{ tileProvidersList.length }} opções disponíveis
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="provider in tileProvidersList"
                :key="provider.id"
                :id="`tile-option-${provider.id}`"
                @click="handleSelectTile(provider.id)"
                :class="[
                  'group relative p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between overflow-hidden',
                  store.selectedTileProvider === provider.id
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/20 shadow-md ring-2 ring-blue-500/20'
                    : 'border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-white dark:bg-slate-900/40'
                ]"
              >
                <!-- Mini Preview Top Stripe -->
                <div
                  class="h-2 w-full rounded-full mb-2.5 transition-opacity"
                  :style="{ background: provider.previewBg }"
                ></div>

                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2.5">
                    <div
                      :class="[
                        'w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold transition-all',
                        store.selectedTileProvider === provider.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-blue-50 dark:group-hover:bg-slate-700'
                      ]"
                    >
                      <i :class="['fa-solid', provider.icon]"></i>
                    </div>
                    <div>
                      <h4 class="text-xs font-black text-slate-800 dark:text-white leading-tight">
                        {{ provider.name }}
                      </h4>
                      <span
                        :class="[
                          'text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border inline-block mt-0.5',
                          provider.badgeClass
                        ]"
                      >
                        {{ provider.tag }}
                      </span>
                    </div>
                  </div>

                  <!-- Radio/Check Circle -->
                  <div
                    :class="[
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
                      store.selectedTileProvider === provider.id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    ]"
                  >
                    <i
                      v-if="store.selectedTileProvider === provider.id"
                      class="fa-solid fa-check text-[10px]"
                    ></i>
                  </div>
                </div>

                <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-2 leading-snug">
                  {{ provider.desc }}
                </p>
              </div>
            </div>
          </section>

          <!-- SEÇÃO 2: ZOOM PROFUNDO & SUPER ZOOM -->
          <section class="bg-slate-50 dark:bg-white/[0.02] p-4.5 rounded-2xl border border-slate-200/80 dark:border-white/10 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <label class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <i class="fa-solid fa-magnifying-glass-plus text-emerald-500"></i>
                  Visualização em Zoom Alto (Super Zoom)
                </label>
                <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                  Permite aproximar o mapa até detalhes internos sem perder ou quebrar os tiles
                </p>
              </div>
              <span
                class="px-2.5 py-1 text-xs font-black rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap"
              >
                Max: {{ store.maxZoomLevel }}x
              </span>
            </div>

            <!-- Predefinições de Zoom Máximo -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                v-for="opt in ZOOM_LEVEL_OPTIONS"
                :key="opt.value"
                type="button"
                :id="`btn-zoom-opt-${opt.value}`"
                @click="handleSetMaxZoom(opt.value)"
                :class="[
                  'py-2 px-3 rounded-xl border text-xs font-black transition-all flex flex-col items-center justify-center text-center gap-0.5',
                  store.maxZoomLevel === opt.value
                    ? 'border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shadow-sm ring-1 ring-emerald-500/30'
                    : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800/40'
                ]"
              >
                <span>{{ opt.value }}x</span>
                <span class="text-[9px] opacity-75 font-medium">{{ opt.value >= 25 ? 'Super Zoom' : 'Aproximado' }}</span>
              </button>
            </div>

            <!-- Slider fino de Zoom Máximo -->
            <div class="space-y-1.5 pt-1">
              <div class="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span>Zoom Padrão (20x)</span>
                <span class="text-blue-600 dark:text-blue-400 font-extrabold">{{ store.maxZoomLevel }}x Atual</span>
                <span>Zoom Extremo (26x)</span>
              </div>
              <input
                id="input-slider-max-zoom"
                type="range"
                min="19"
                max="26"
                step="1"
                :value="store.maxZoomLevel"
                @input="handleSetMaxZoom($event.target.value)"
                class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
            </div>

            <!-- Toggle Nitidez Reforçada (Crisp Edges) -->
            <div
              class="pt-3 border-t border-slate-200/60 dark:border-white/10 flex items-center justify-between"
            >
              <div class="pr-4">
                <span class="text-xs font-extrabold text-slate-800 dark:text-white block">
                  Otimização de Nitidez de Tiles
                </span>
                <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Aplica suavização e nitidez aos tiles para evitar embaçamento ao ultrapassar a resolução nativa
                </span>
              </div>
              <button
                type="button"
                id="toggle-tile-sharpness"
                @click="store.toggleTileSharpness"
                :class="[
                  'w-11 h-6 flex items-center rounded-full p-1 transition-colors flex-shrink-0',
                  store.tileSharpness ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                ]"
              >
                <div
                  :class="[
                    'bg-white w-4 h-4 rounded-full shadow-md transform transition-transform',
                    store.tileSharpness ? 'translate-x-5' : 'translate-x-0'
                  ]"
                ></div>
              </button>
            </div>
          </section>

          <!-- SEÇÃO 3: OPACIDADE DA PLANTA BAIXA -->
          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <label class="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <i class="fa-solid fa-clone text-purple-500"></i>
                  Opacidade da Planta Baixa (Andar)
                </label>
                <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                  Permite enxergar o satélite ou mapa de ruas por baixo da estrutura da FAET
                </p>
              </div>
              <span class="text-xs font-black text-purple-600 dark:text-purple-400">
                {{ Math.round((store.floorOpacity || 0.85) * 100) }}%
              </span>
            </div>

            <!-- Chips de atalho rápido -->
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                @click="setPresetOpacity(0.3)"
                :class="[
                  'px-3 py-1.5 text-xs font-black rounded-xl border transition-all',
                  store.floorOpacity === 0.3
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                ]"
              >
                30% (Translúcido)
              </button>
              <button
                type="button"
                @click="setPresetOpacity(0.6)"
                :class="[
                  'px-3 py-1.5 text-xs font-black rounded-xl border transition-all',
                  store.floorOpacity === 0.6
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                ]"
              >
                60% (Suave)
              </button>
              <button
                type="button"
                @click="setPresetOpacity(0.85)"
                :class="[
                  'px-3 py-1.5 text-xs font-black rounded-xl border transition-all',
                  store.floorOpacity === 0.85
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                ]"
              >
                85% (Padrão)
              </button>
              <button
                type="button"
                @click="setPresetOpacity(1.0)"
                :class="[
                  'px-3 py-1.5 text-xs font-black rounded-xl border transition-all',
                  store.floorOpacity === 1.0
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                ]"
              >
                100% (Opaco)
              </button>
            </div>

            <input
              id="input-slider-floor-opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              :value="store.floorOpacity || 0.85"
              @input="handleFloorOpacityChange"
              class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
          </section>

          <!-- SEÇÃO 4: PREFERÊNCIAS DO SISTEMA -->
          <section class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div
              @click="store.toggleDarkMode"
              class="p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between cursor-pointer hover:border-slate-300 transition-all"
            >
              <div class="flex items-center gap-3">
                <i
                  :class="[
                    'text-base',
                    store.isDarkMode ? 'fa-solid fa-moon text-indigo-400' : 'fa-solid fa-sun text-amber-500'
                  ]"
                ></i>
                <span class="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Modo Noturno (Dark)
                </span>
              </div>
              <span class="text-xs font-black text-slate-500">
                {{ store.isDarkMode ? 'Ativo' : 'Claro' }}
              </span>
            </div>

            <div
              @click="store.toggleLayersVisibility"
              class="p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between cursor-pointer hover:border-slate-300 transition-all"
            >
              <div class="flex items-center gap-3">
                <i
                  :class="[
                    'text-base',
                    store.layersVisible ? 'fa-solid fa-eye text-blue-500' : 'fa-solid fa-eye-slash text-slate-400'
                  ]"
                ></i>
                <span class="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Rótulos e Marcadores
                </span>
              </div>
              <span class="text-xs font-black text-slate-500">
                {{ store.layersVisible ? 'Exibidos' : 'Ocultos' }}
              </span>
            </div>
          </section>
        </div>

        <!-- Modal Footer -->
        <div
          class="px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.02] flex items-center justify-between gap-3"
        >
          <button
            type="button"
            id="btn-reset-settings"
            @click="resetDefaults"
            class="text-xs font-extrabold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 transition-colors py-2 px-2"
          >
            <i class="fa-solid fa-arrow-rotate-left"></i>
            <span>Restaurar Padrões</span>
          </button>

          <button
            type="button"
            id="btn-confirm-settings"
            @click="handleClose"
            class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2"
          >
            <i class="fa-solid fa-check"></i>
            <span>Concluir</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@keyframes scaleUp {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.animate-scaleUp {
  animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
