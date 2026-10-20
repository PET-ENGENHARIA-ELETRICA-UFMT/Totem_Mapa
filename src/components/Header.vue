<script setup>
import { useMainStore } from '../stores/mainStore.js';

const store = useMainStore();

function handleSettingsClick() {
  store.openSettingsModal();
}

function handleLayersClick() {
  store.toggleLayersVisibility();
}

function handleProfileClick() {
  store.showNotification('Perfil do Totem AcessoMap FAET/UFMT', 'info');
}
</script>

<template>
  <header class="contents">
    <!-- LEGENDA DO MAPA (topo: adaptável a mobile portrait e landscape, preservado no desktop) -->
    <aside
      aria-label="Legenda do Mapa"
      class="absolute top-2.5 sm:top-3 md:top-4 left-14 sm:left-16 md:left-1/2 md:-translate-x-1/2 z-[1000] pointer-events-auto max-w-[calc(100vw-8.5rem)] sm:max-w-[calc(100vw-10rem)] md:max-w-none overflow-x-auto no-scrollbar transition-all"
    >
      <div
        class="bg-[#1a1f2e]/90 dark:bg-[#0d1117]/95 text-white backdrop-blur-md px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 rounded-full border border-white/10 flex items-center gap-2.5 sm:gap-3 md:gap-4 text-[9px] sm:text-[9.5px] md:text-[10px] font-black shadow-xl whitespace-nowrap tracking-wide uppercase transition-all duration-300"
      >
        <div class="flex items-center gap-1.5">
          <span class="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-blue-500 block"></span>
          <span>Rota acessível</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-emerald-500 block"></span>
          <span>Início</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-rose-500 block"></span>
          <span>Destino</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-purple-500 block"></span>
          <span>Acessibilidade</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-cyan-500 block"></span>
          <span>Informação</span>
        </div>
      </div>
    </aside>

    <!-- BOTÕES DE AÇÃO RÁPIDA (topo direita: condensados em mobile portrait e landscape) -->
    <nav
      aria-label="Ações Rápidas"
      class="absolute top-2 sm:top-2.5 md:top-4 right-2 sm:right-3 md:right-4 z-[1000] flex items-center gap-1.5 sm:gap-2 md:gap-3 pointer-events-auto"
    >
      <button
        id="btn-action-settings"
        type="button"
        title="Configurações"
        @click="handleSettingsClick"
        class="w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 bg-[#1a1f2e]/90 text-white backdrop-blur-md rounded-full shadow-lg border border-white/10 flex items-center justify-center hover:bg-[#252c3e] transition-all active:scale-95"
      >
        <i class="fa-solid fa-gear text-xs sm:text-sm md:text-base"></i>
      </button>

      <button
        id="btn-action-layers"
        type="button"
        title="Camadas"
        @click="handleLayersClick"
        class="w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 bg-[#1a1f2e]/90 text-white backdrop-blur-md rounded-full shadow-lg border border-white/10 flex items-center justify-center hover:bg-[#252c3e] transition-all active:scale-95"
      >
        <i class="fa-solid fa-layer-group text-xs sm:text-sm md:text-base"></i>
      </button>

      <button
        id="btn-action-profile"
        type="button"
        title="Perfil"
        @click="handleProfileClick"
        class="w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 bg-[#1a1f2e]/90 text-white backdrop-blur-md rounded-full shadow-lg border border-white/10 flex items-center justify-center hover:bg-[#252c3e] transition-all active:scale-95"
      >
        <i class="fa-solid fa-circle-user text-xs sm:text-sm md:text-base"></i>
      </button>
    </nav>
  </header>
</template>
