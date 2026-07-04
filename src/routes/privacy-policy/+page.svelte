<script lang="ts">
	const h1Classes = 'text-2xl border-b-2 border-divBorderLight dark:border-divBorderDark';
	const h2Classes =
		'text-xl border-b-2 border-divBorderLight dark:border-divBorderDark border-t-0 mt-6';
	const pClasses = 'my-2 text-normal leading-5 text-textLight dark:text-textDark';
</script>

<div
	class="fixed bottom-0 top-[3rem] overflow-y-scroll px-8
            py-2 text-textLight lg:top-[3.5rem] xl:top-[4rem] dark:text-white"
>
	<h1 class={h1Classes}>Privacy Policy for Knight Planner</h1>
	<p class={pClasses}>Last Updated: July 4, 2026</p>

	<h2 class={h2Classes}>Overview</h2>
	<p class={pClasses}>
		Knight Planner stores schedules locally in your browser so you can return to your plans later.
		The app does not require an account for normal planning use.
	</p>

	<h2 class={h2Classes}>What Data Is Stored</h2>
	<p class={pClasses}>
		Your selected courses, custom events, schedule names, theme choice, and similar planning
		preferences may be saved in local browser storage. Clearing site data in your browser removes
		that local information.
	</p>

	<h2 class={h2Classes}>External Sources</h2>
	<p class={pClasses}>
		When you search, the app may request live course and section information from UCF public
		sources and professor rating information from RateMyProfessors. Those services may receive
		ordinary request metadata from your browser or the deployed server.
	</p>

	<h2 class={h2Classes}>Sharing</h2>
	<p class={pClasses}>
		Knight Planner does not sell personal data. Schedule share links encode the selected schedule
		so anyone with the link can view that shared plan.
	</p>

	<h2 class={h2Classes}>Contact</h2>
	<p class={pClasses}>
		For privacy questions, contact
		<code class="ml-1 rounded-md bg-bgSecondaryLight p-1 text-sm dark:bg-bgSecondaryDark">
			hsribeiro1@gmail.com</code
		>.
	</p>
</div>
