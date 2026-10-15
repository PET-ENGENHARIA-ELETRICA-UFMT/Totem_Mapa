<script setup>
import { computed } from 'vue';
import { useMainStore } from '../../stores/mainStore.js';

const store = useMainStore();

const room = computed(() => {
  return store.modalRoom || store.selectedRoomFeature;
});

const propsData = computed(() => {
  return room.value?.properties || {};
});

const floorText = computed(() => {
  const andar = propsData.value.andar;
  if (andar === undefined || andar === null) return 'FAET';
  return andar === 0 || andar === '0' ? 'Térreo' : `${andar}º Andar`;
});

const isAccessible = computed(() => {
  return propsData.value.acessivel === true || propsData.value.acessibilidade === 'true';
});

function handleClose() {
  store.closeDetailsModal();
}

function setOrigin() {
  if (propsData.value.nome) {
    store.setAsOrigin(propsData.value.nome);
    store.closeDetailsModal();
  }
}

function setDestination() {
  if (propsData.value.nome) {
    store.setAsDestination(propsData.value.nome);
    store.closeDetailsModal();
  }
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
      v-if="store.isDetailsModalOpen && room"
      class="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm pointer-events-auto"
      @click.self="handleClose"
    >
      <div
        class="bg-white dark:bg-[#1a1f2e] border border-white/60 dark:border-white/10 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col transform transition-all animate-scaleUp"
      >
        <!-- Modal Media Banner -->
        <div class="relative h-48 w-full bg-slate-100 dark:bg-slate-800">
          <img
            :src="propsData.imagem || 'https://placehold.co/600x300/eeeeee/cccccc?text=Sem+Imagem'"
            :alt="propsData.nome"
            class="w-full h-full object-cover"
          />
          <button
            type="button"
            @click="handleClose"
            class="absolute top-4 right-4 w-9 h-9 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-all shadow-md active:scale-95"
          >
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        <!-- Modal Body Content -->
        <div class="p-6 flex flex-col gap-4">
          <div>
            <div class="flex items-center justify-between">
              <h3 class="text-xl font-black text-slate-800 dark:text-white tracking-tight">
                {{ propsData.nome || 'Detalhes do Local' }}
              </h3>
            </div>

            <!-- Tags -->
            <div class="flex flex-wrap gap-2 mt-2">
              <span
                class="px-2.5 py-1 text-[11px] font-extrabold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-blue-900/30"
              >
                Bloco {{ (propsData.bloco || 'FAET').toUpperCase() }}
              </span>
              <span
                class="px-2.5 py-1 text-[11px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg"
              >
                {{ floorText }}
              </span>
              <span
                :class="[
                  'px-2.5 py-1 text-[11px] font-extrabold rounded-lg border',
                  isAccessible
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30'
                ]"
              >
                {{ isAccessible ? 'Acessível' : 'Escadas' }}
              </span>
            </div>
          </div>

          <!-- Description -->
          <div class="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
            <p>
              {{ propsData.descricao || `Ambiente cadastrado no bloco de engenharia elétrica da FAET / UFMT. Tipo: ${propsData.tipo || 'Sala'}.` }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              @click="setDestination"
              class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-xs uppercase tracking-wider active:scale-[0.98]"
            >
              <i class="fa-solid fa-location-arrow"></i>
              <span>Como Chegar</span>
            </button>
            <button
              type="button"
              @click="setOrigin"
              class="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider active:scale-[0.98]"
            >
              <i class="fa-solid fa-flag"></i>
              <span>Partir Daqui</span>
            </button>
          </div>
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
</style>
