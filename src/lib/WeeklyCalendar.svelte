<script lang="ts">
  import type { CalendarBlock, DayOfWeek } from "$lib/types";
  import { dayLabels, days, minutesToDisplay, timeToMinutes } from "$lib/planner";

  export let blocks: CalendarBlock[] = [];
  export let removeSelection: (sourceId: string) => void = () => {};
  export let removeCustomEvent: (sourceId: string) => void = () => {};
  export let selectBlock: (sourceId: string) => void = () => {};

  const minuteHeight = 1.85;
  type PositionedBlock = CalendarBlock & { column: number; columns: number };

  $: normalizedBlocks = blocks.map((block) => ({ ...block, dayOfWeek: normalizeDay(block.dayOfWeek) }));
  $: timedBlocks = normalizedBlocks.filter((block) => block.dayOfWeek !== "Online");
  $: otherBlocks = normalizedBlocks.filter((block) => block.dayOfWeek === "Online");
  $: shownColumns = [
    ...days.filter((day) => ["M", "Tu", "W", "Th", "F"].includes(day) || timedBlocks.some((block) => block.dayOfWeek === day)),
    ...(otherBlocks.length ? (["Online"] as DayOfWeek[]) : [])
  ];
  $: timedMinutes = timedBlocks
    .flatMap((block) => [timeToMinutes(block.startTime), timeToMinutes(block.endTime)])
    .filter((value) => value > 0);
  $: minHour = timedMinutes.length ? Math.max(5, Math.floor(Math.min(...timedMinutes) / 60)) : 8;
  $: maxHour = timedMinutes.length ? Math.min(23, Math.ceil(Math.max(...timedMinutes) / 60)) : 18;
  $: start = Math.max(5 * 60, minHour * 60);
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
    if (value === "sa" || value === "sat" || value === "saturday") return "Sa";
    if (value === "su" || value === "sun" || value === "sunday") return "Su";
    return "Online";
  }

  function blockTop(block: CalendarBlock) {
    return Math.max(0, (timeToMinutes(block.startTime) - start) * minuteHeight);
  }

  function blockHeight(block: CalendarBlock) {
    return Math.max(44, (timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) * minuteHeight - 4);
  }

  function blockStart(block: CalendarBlock) {
    return timeToMinutes(block.startTime);
  }

  function blockEnd(block: CalendarBlock) {
    return timeToMinutes(block.endTime);
  }

  function blocksOverlap(a: CalendarBlock, b: CalendarBlock) {
    if (a.dayOfWeek === "Online" || b.dayOfWeek === "Online") return false;
    return blockStart(a) < blockEnd(b) && blockStart(b) < blockEnd(a);
  }

  function positionedBlocksForDay(day: DayOfWeek): PositionedBlock[] {
    const dayBlocks = normalizedBlocks.filter((block) => block.dayOfWeek === day);
    if (day === "Online") return dayBlocks.map((block, index) => ({ ...block, column: index, columns: 1 }));

    const sorted = [...dayBlocks].sort((a, b) => blockStart(a) - blockStart(b) || blockEnd(b) - blockEnd(a));
    const positioned: PositionedBlock[] = [];
    const active: PositionedBlock[] = [];

    for (const block of sorted) {
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (blockEnd(active[index]) <= blockStart(block)) active.splice(index, 1);
      }
      const used = new Set(active.map((item) => item.column));
      let column = 0;
      while (used.has(column)) column += 1;
      const positionedBlock: PositionedBlock = { ...block, column, columns: 1 };
      active.push(positionedBlock);
      positioned.push(positionedBlock);
    }

    const visited = new Set<string>();
    for (const block of positioned) {
      if (visited.has(block.id)) continue;
      const group = collectOverlapGroup(block, positioned);
      const columns = Math.max(1, ...group.map((item) => item.column + 1));
      group.forEach((item) => {
        item.columns = columns;
        visited.add(item.id);
      });
    }

    return positioned;
  }

  function collectOverlapGroup(startBlock: PositionedBlock, blocksForDay: PositionedBlock[]) {
    const group: PositionedBlock[] = [];
    const queue = [startBlock];
    const seen = new Set<string>();
    while (queue.length) {
      const block = queue.pop()!;
      if (seen.has(block.id)) continue;
      seen.add(block.id);
      group.push(block);
      blocksForDay.forEach((other) => {
        if (!seen.has(other.id) && blocksOverlap(block, other)) queue.push(other);
      });
    }
    return group;
  }

  function blockLeft(block: PositionedBlock) {
    return `calc(0.5rem + ${block.column} * ((100% - 1rem) / ${block.columns}))`;
  }

  function blockWidth(block: PositionedBlock) {
    return `calc((100% - 1rem) / ${block.columns} - 0.25rem)`;
  }

  function compactTime(time: string) {
    if (!time) return "";
    const [hourText, minuteText] = time.split(":");
    const hour24 = Number(hourText);
    const suffix = hour24 >= 12 ? "pm" : "am";
    const hour = hour24 % 12 || 12;
    return `${hour}:${minuteText}${suffix}`;
  }

  function compactTimeRange(block: CalendarBlock) {
    if (!block.startTime || !block.endTime) return "Async";
    return `${compactTime(block.startTime)} - ${compactTime(block.endTime)}`;
  }

  function removeBlock(block: CalendarBlock) {
    if (block.type === "course") removeSelection(block.sourceId);
    else removeCustomEvent(block.sourceId);
  }

  function handleBlockKeydown(event: KeyboardEvent, block: CalendarBlock) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectBlock(block.sourceId);
  }
</script>

<div
  class="h-full overflow-auto bg-white dark:bg-bgDark"
  data-calendar-block-count={blocks.length}
  data-calendar-timed-count={timedBlocks.length}
  data-calendar-days={normalizedBlocks.map((block) => block.dayOfWeek).join(",")}
>
  <div
    class="grid min-w-[900px] border-b border-divBorderLight bg-white font-bold text-textLight dark:border-divBorderDark dark:bg-bgDark dark:text-textDark"
    style={`grid-template-columns:5rem repeat(${shownColumns.length}, minmax(9rem, 1fr))`}
  >
    <div class="border-r border-divBorderLight dark:border-divBorderDark"></div>
    {#each shownColumns as day}
      <div class="border-r border-divBorderLight py-2 text-center last:border-r-0 dark:border-divBorderDark">{dayLabels[day]}</div>
    {/each}
  </div>

  <div class="grid min-w-[900px] bg-white dark:bg-bgDark" style={`height:${gridHeight}px;grid-template-columns:5rem repeat(${shownColumns.length}, minmax(9rem, 1fr))`}>
    <div class="relative border-r border-divBorderLight bg-white dark:border-divBorderDark dark:bg-bgDark">
      {#each hours as hour}
        <div class="absolute left-0 right-0 z-10 -translate-y-1/2 whitespace-nowrap bg-white pr-2 text-right text-xs font-bold text-secCodesLight dark:bg-bgDark dark:text-textDark/70" style={`top:${(hour - start) * minuteHeight}px`}>
          {minutesToDisplay(hour)}
        </div>
      {/each}
    </div>

    {#each shownColumns as day}
      <div class="relative border-r border-divBorderLight last:border-r-0 dark:border-divBorderDark">
        {#if day !== "Online"}
          {#each hours as hour}
            <div class="absolute left-0 right-0 border-t border-divBorderLight dark:border-divBorderDark" style={`top:${(hour - start) * minuteHeight}px`}></div>
          {/each}
        {/if}

        {#each positionedBlocksForDay(day) as block, index (block.id)}
          <div
            role="button"
            tabindex={block.preview ? -1 : 0}
            class:opacity-45={block.preview}
            class:ring-2={block.conflict}
            class:ring-red-500={block.conflict}
            class="absolute overflow-hidden rounded-xl text-center !text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-ucfGold"
            style={`top:${day === "Online" ? 8 + index * 128 : blockTop(block)}px;left:${day === "Online" ? "0.5rem" : blockLeft(block)};width:${day === "Online" ? "calc(100% - 1rem)" : blockWidth(block)};height:${day === "Online" ? 120 : blockHeight(block)}px;background:${block.type === "custom" ? "#d8d8d8" : block.color}`}
            on:click={() => !block.preview && selectBlock(block.sourceId)}
            on:keydown={(event) => !block.preview && handleBlockKeydown(event, block)}
          >
            <div class="flex min-h-7 items-center justify-center truncate bg-black/10 px-7 py-1 text-[clamp(0.8rem,1.2vw,1.25rem)] font-black leading-tight">
              {block.courseCode ?? block.title}
            </div>
            {#if !block.preview}
              <button
                class="absolute right-2 top-1 z-10 grid h-7 w-7 place-items-center rounded-full text-2xl font-black leading-none !text-black hover:bg-black/10"
                aria-label={`Remove ${block.title}`}
                on:click|stopPropagation={() => removeBlock(block)}
              >
                ×
              </button>
            {/if}
            <div class="overflow-hidden px-2 py-1 text-[clamp(0.68rem,0.9vw,1rem)] leading-tight">
              {#if block.professor}<div class="truncate">{block.professor}</div>{/if}
              <div class="truncate">{compactTimeRange(block)}</div>
              {#if block.sectionNumber}<div class="truncate">Section {block.sectionNumber}</div>{/if}
              {#if block.location}<div class="truncate">{block.location}</div>{/if}
            </div>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>
