<script lang="ts">
  import type { HeatmapDayCell } from '../lib/db/database';
  import { hapticSelection } from '../lib/haptics.js';

  interface Props {
    cells: HeatmapDayCell[];
    totalReviews: number;
    currentStreak: number;
    todayCount: number;
  }

  let { cells = [], totalReviews = 0, currentStreak = 0, todayCount = 0 }: Props = $props();

  let selectedCell = $state<HeatmapDayCell | null>(null);

  // Agrupar las 84 celdas en 12 columnas (semanas) de 7 días estilo GitHub
  let weeks = $derived.by(() => {
    const cols: HeatmapDayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      cols.push(cells.slice(i, i + 7));
    }
    return cols;
  });

  function getLevelClasses(level: HeatmapDayCell['level'], isToday: boolean): string {
    const ring = isToday ? 'ring-1 ring-[#a7f3d0] ring-offset-1 ring-offset-[#121820]' : '';
    switch (level) {
      case 4:
        return `bg-[#a7f3d0] ${ring}`;
      case 3:
        return `bg-[#5eead4]/80 ${ring}`;
      case 2:
        return `bg-[#3b6e5c] ${ring}`;
      case 1:
        return `bg-[#264239] ${ring}`;
      default:
        return `bg-[#1b2430] border border-white/[0.04] ${ring}`;
    }
  }

  async function selectDay(cell: HeatmapDayCell) {
    await hapticSelection();
    selectedCell = cell;
  }
</script>

<section class="rounded-[26px] bg-[#161b20] p-4 shadow-lg">
  <!-- Header del Heatmap -->
  <div class="flex items-center justify-between mb-3">
    <div>
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-white"></span>
        <h3 class="text-xs font-bold uppercase tracking-wider text-white">
          Consistencia de Estudio
        </h3>
      </div>
      <p class="text-[11px] text-white/60 mt-0.5">
        {totalReviews} repasos en las últimas 12 semanas
      </p>
    </div>

    <div class="flex items-center gap-2">
      <div class="px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-semibold text-white">
        🔥 {currentStreak}d racha
      </div>
      <div class="px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-medium text-white/80">
        Hoy: <strong class="text-white">{todayCount}</strong>
      </div>
    </div>
  </div>

  <!-- Grilla estilo GitHub (12 semanas x 7 días) -->
  <div class="overflow-x-auto pb-1">
    <div class="grid grid-flow-col auto-cols-fr gap-1.5 min-w-[290px]">
      {#each weeks as week}
        <div class="grid grid-rows-7 gap-1.5">
          {#each week as cell (cell.dateKey)}
            <button
              type="button"
              onclick={() => selectDay(cell)}
              aria-label="{cell.dateKey}: {cell.count} repasos"
              class="w-full aspect-square rounded-[4px] transition-transform active:scale-125 {getLevelClasses(cell.level, cell.isToday)}"
            ></button>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  <!-- Leyenda inferior e inspección de celda seleccionada -->
  <div class="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
    {#if selectedCell}
      <span class="text-slate-300">
        📅 <strong class="text-[#a7f3d0]">{selectedCell.dateKey}</strong>: {selectedCell.count} tarjetas estudiadas
      </span>
    {:else}
      <span>Tocá cualquier día para ver tu actividad</span>
    {/if}

    <div class="flex items-center gap-1">
      <span class="text-[10px] mr-1">Menos</span>
      <span class="w-2.5 h-2.5 rounded-[3px] bg-[#1b2430] border border-white/5"></span>
      <span class="w-2.5 h-2.5 rounded-[3px] bg-[#264239]"></span>
      <span class="w-2.5 h-2.5 rounded-[3px] bg-[#3b6e5c]"></span>
      <span class="w-2.5 h-2.5 rounded-[3px] bg-[#5eead4]/80"></span>
      <span class="w-2.5 h-2.5 rounded-[3px] bg-[#a7f3d0]"></span>
      <span class="text-[10px] ml-1">Más</span>
    </div>
  </div>
</section>

