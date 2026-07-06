<!-- 
This file is part of Jupiterp. For terms of use, please see the file
called LICENSE at the top level of the Jupiterp source tree (online at
https://github.com/atcupps/Jupiterp/LICENSE).
Copyright (C) 2026 Andrew Cupps
 -->
<script lang="ts">
	import '../app.css';
	import Analytics from '../components/layout/Analytics.svelte';
	import AppUpdateReloader from '../components/layout/AppUpdateReloader.svelte';
	import SiteLinks from '../components/layout/SiteLinks.svelte';
	import StartupIndexCheck from '../components/layout/StartupIndexCheck.svelte';
</script>

<Analytics />
<AppUpdateReloader />
<StartupIndexCheck />

<div class="fixed z-[50] w-full px-4">
	<div
		class="flex h-12 flex-row justify-start border-b-2 border-divBorderLight dark:border-divBorderDark"
	>
		<a href="/" class="flex shrink-0 items-center gap-5 py-0.5" aria-label="Knight Planner home">
			<img
				src="/logo-mark.svg?v=20260706a"
				alt="Knight Planner logo"
				class="h-11 w-11 object-contain"
			/>
			<span class="flex flex-col leading-none">
				<span
					class="font-[Cinzel] text-[1.05rem] font-extrabold uppercase tracking-[0.04em]
						text-orange"
				>
					KNIGHT
				</span>
				<span
					class="text-slate-600 dark:text-slate-100 font-[Inter] text-[0.75rem]
						font-semibold"
				>
					Planner
				</span>
			</span>
		</a>
		<SiteLinks />
	</div>
</div>

<slot />
