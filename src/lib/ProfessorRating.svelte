<script lang="ts">
  export let name: string;

  let rating: { rating: number | null; ratingCount?: number | null; url?: string | null } | null = null;
  let lastName = "";

  $: if (name && name !== lastName) {
    lastName = name;
    rating = null;
    if (name.trim() && name !== "TBA") {
      fetch(`/api/ucf/rmp?name=${encodeURIComponent(name.trim())}`)
        .then((response) => response.json())
        .then((payload) => (rating = payload))
        .catch(() => undefined);
    }
  }

  $: stars = rating?.rating ? "★".repeat(Math.max(1, Math.round(rating.rating))) : "";
</script>

{#if rating?.rating}
  {#if rating.url}
    <a href={rating.url} target="_blank" rel="noreferrer" class="text-ucfDarkGold underline-offset-2 hover:underline" on:click|stopPropagation>
      {stars} {rating.rating.toFixed(1)}{rating.ratingCount ? ` (${rating.ratingCount})` : ""}
    </a>
  {:else}
    <span class="text-ucfDarkGold">{stars} {rating.rating.toFixed(1)}{rating.ratingCount ? ` (${rating.ratingCount})` : ""}</span>
  {/if}
{:else}
  <span class="text-black/45">RMP unavailable</span>
{/if}
