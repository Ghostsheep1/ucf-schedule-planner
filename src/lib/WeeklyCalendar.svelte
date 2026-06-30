<script lang="ts">
  import type { CalendarBlock, DayOfWeek } from "$lib/types";
  import { dayLabels, days, formatTimeRange, minutesToDisplay, timeToMinutes } from "$lib/planner";

  export let blocks: CalendarBlock[] = [];
  export let removeSelection: (sourceId: string) => void = () => {};
  export let removeCustomEvent: (sourceId: string) => void = () => {};

  const minuteHeight = 1.85;

  $: normalizedBlocks = blocks.map((block) => ({ ...block, dayOfWeek: normalizeDay(block.dayOfWeek) }));
  $: timedBlocks = normalizedBlocks.filter((block) => block.dayOfWeek !== "Online");
  $: otherBlocks = normalizedBlocks.filter((block) => block.dayOfWeek === "Online");
  $: timedMinutes = timedBlocks
    .flatMap((block) => [timeToMinutes(block.startTime), timeToMinutes(block.endTime)])
    .filter((value) => value > 0);
  $: minHour = timedMinutes.length ? Math.max(5, Math.floor(Math.min(...timedMinutes) / 60)) : 8;
  $: maxHour = timedMinutes.length ? Math.min(23, Math.ceil(Math.max(...timedMinutes) / 60)) : 18;
  $: start = minHour * 60;
  $: end = Math.max(maxHour * 60, start + 8 * 60);
  $: hours = Array.from({ length: Math.floor((end - start) / 60) + 1 }, (_, index) => start + index * 60);
  $: gridHeight = (end - start) * minuteHeight;

  function normalizeDay(day: DayOfWeek | string): DayOfWeek {
    const value = day.toLowerCase();
    if (value === "m" || value === "mo" || value === "mon" || value === "monday") return "M";
    if (value === "tu" || value === "tue" || value === "tues" || value === "tuesday") return "Tu";
    if (value === "w" || value === "we" || value === "wed" || value === "wednesday") return "W";
    if (value === "th" || value === "thu" || value === "thur" || value === "thurs" || value === "thursday") return "Th";
    if (value === "f" || value === "fr" || value === "fri" || value === "friday") return "F";
    return "Online";
  }

  function blockTop(block: CalendarBlock) {
    return Math.max(0, (timeToMinutes(block.startTime) - start) * minuteHeight);
  }

  function blockHeight(block: CalendarBlock) {
    return Math.max(44, (timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) * minuteHeight - 4);
  }

  function removeBlock(block: CalendarBlock) {
    if (block.type === "course") removeSelection(block.sourceId);
    else removeCustomEvent(block.sourceId);
  }
</script>

<div
  class="h-full overflow-auto bg-white"
  data-calendar-block-count={blocks.length}
  data-calendar-timed-count={timedBlocks.length}
  data-calendar-days={normalizedBlocks.map((block) => block.dayOfWeek).join(",")}
>
  <div class="grid min-w-[900px] grid-cols-[3.75rem_repeat(5,minmax(9rem,1fr))] border-b border-gridLight bg-white font-bold text-textLight">
    <div class="border-r border-gridLight"></div>
    {#each days as day}
      <div class="border-r border-gridLight py-2 text-center last:border-r-0">{dayLabels[day]}</div>
    {/each}
  </div>

  <div class="grid min-w-[900px] grid-cols-[3.75rem_repeat(5,minmax(9rem,1fr))]" style={`height:${gridHeight}px`}>
    <div class="relative border-r border-gridLight bg-white">
      {#each hours as hour}
        <div class="absolute left-0 right-0 -translate-y-2 pr-2 text-right text-xs font-bold text-muted" style={`top:${(hour - start) * minuteHeight}px`}>
          {minutesToDisplay(hour)}
        </div>
      {/each}
    </div>

    {#each days as day}
      <div class="relative border-r border-gridLight last:border-r-0">
        {#each hours as hour}
          <div class="absolute left-0 right-0 border-t border-gridLight" style={`top:${(hour - start) * minuteHeight}px`}></div>
        {/each}

        {#each timedBlocks.filter((block) => block.dayOfWeek === day) as block (block.id)}
          <div
            class:opacity-45={block.preview}
            class:ring-2={block.conflict}
            class:ring-red-500={block.conflict}
            class="absolute left-2 right-2 overflow-hidden rounded-md px-2 py-2 text-xs font-bold text-white shadow-sm"
            style={`top:${blockTop(block)}px;height:${blockHeight(block)}px;background:${block.type === "custom" ? "#1c1c1c" : block.color}`}
          >
            {#if !block.preview}
              <button
                class="absolute right-1 top-1 h-5 w-5 rounded bg-black/20 leading-5 text-white hover:bg-black/35"
                aria-label={`Remove ${block.title}`}
                on:click={() => removeBlock(block)}
              >
                ×
              </button>
            {/if}
            <div class="pr-5">{block.courseCode ?? block.title}</div>
            {#if block.professor}<div class="font-normal">{block.professor}</div>{/if}
            <div class="font-normal">{formatTimeRange(block.startTime, block.endTime)}</div>
            {#if block.sectionNumber}<div class="font-normal">Sec {block.sectionNumber}</div>{/if}
            {#if block.location}<div class="font-normal">{block.location}</div>{/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>

  {#if otherBlocks.length}
    <div class="min-w-[900px] border-t border-gridLight bg-bgLight p-3">
      <div class="mb-2 text-xs font-black uppercase text-muted">Other / Online</div>
      <div class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {#each otherBlocks as block (block.id)}
          <div class="relative rounded-md border border-secCodesLight bg-white p-3 text-sm shadow-sm" class:opacity-45={block.preview}>
            {#if !block.preview}
              <button
                class="absolute right-2 top-2 h-6 w-6 rounded border border-secCodesLight text-muted hover:bg-hoverLight"
                aria-label={`Remove ${block.title}`}
                on:click={() => removeBlock(block)}
              >
                ×
              </button>
            {/if}
            <div class="pr-8 font-black">{block.courseCode ?? block.title}</div>
            {#if block.professor}<div class="text-muted">{block.professor}</div>{/if}
            <div>{formatTimeRange(block.startTime, block.endTime)}</div>
            {#if block.location}<div class="text-muted">{block.location}</div>{/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
