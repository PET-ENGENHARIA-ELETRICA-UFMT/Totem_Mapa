<script setup>
import { onMounted } from 'vue';
import { useMainStore } from './stores/mainStore.js';
import Header from './components/Header.vue';
import Sidebar from './components/Sidebar.vue';
import MainView from './components/MainView.vue';
import DetailsModal from './components/Modals/DetailsModal.vue';
import SettingsModal from './components/Modals/SettingsModal.vue';

const store = useMainStore();

onMounted(() => {
  store.initApp();
});
</script>

<template>
  <div
    class="bg-slate-50 flex flex-col h-screen overflow-hidden font-inter text-slate-800 dark:text-slate-200 relative transition-colors duration-300"
  >
    <!-- Estado de Loading Inicial -->
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-500"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="store.isLoading"
        id="app-loading"
        class="absolute inset-0 bg-white dark:bg-[#0f172a] z-[2000] flex flex-col items-center justify-center pointer-events-auto"
      >
        <div
          class="flex flex-col items-center gap-4 text-blue-600 dark:text-blue-500 font-medium"
        >
          <svg
            class="animate-spin h-10 w-10"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              class="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span class="text-lg font-bold tracking-wide">Carregando Mapa...</span>
        </div>
      </div>
    </Transition>

    <!-- Estado de Erro Global -->
    <div
      v-if="store.errorMessage && !store.isLoading && !store.isReady"
      class="absolute inset-0 bg-white dark:bg-[#0f172a] z-[1900] flex flex-col items-center justify-center p-6 text-center"
    >
      <div class="max-w-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 p-6 rounded-3xl flex flex-col items-center gap-4">
        <i class="fa-solid fa-triangle-exclamation text-3xl text-rose-500"></i>
        <h2 class="text-lg font-black text-slate-800 dark:text-white">
          Falha no Carregamento
        </h2>
        <p class="text-xs font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
          {{ store.errorMessage }}
        </p>
        <button
          type="button"
          @click="store.initApp()"
          class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
        >
          Tentar Novamente
        </button>
      </div>
    </div>

    <!-- Componente Central (Mapa Leaflet) -->
    <MainView />

    <!-- Barra Superior / Cabeçalho e Legenda -->
    <Header />

    <!-- Painel Lateral / Controles e Busca -->
    <Sidebar />

    <!-- Modal de Detalhes -->
    <DetailsModal />

    <!-- Modal de Configurações (Tyler do Mapa e Zoom) -->
    <SettingsModal />

    <!-- Notificações Toast Flutuantes -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-8"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-8"
    >
      <div
        v-if="store.notification.visible"
        class="fixed bottom-6 right-20 z-[9999] pointer-events-auto"
      >
        <div
          :class="[
            'px-5 py-3 rounded-2xl shadow-xl font-bold text-xs flex items-center gap-3 backdrop-blur-md border',
            store.notification.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500/50'
              : store.notification.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500/50'
              : store.notification.type === 'warning'
              ? 'bg-amber-600 text-white border-amber-500/50'
              : 'bg-slate-900/90 text-white border-white/10'
          ]"
        >
          <span>{{ store.notification.message }}</span>
          <button
            type="button"
            @click="store.dismissNotification"
            class="opacity-70 hover:opacity-100 text-white ml-1"
          >
            <i class="fa-solid fa-xmark text-xs"></i>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
