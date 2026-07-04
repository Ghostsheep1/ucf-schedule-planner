<script lang="ts">
	const h1Classes = 'text-2xl border-b-2 border-divBorderLight dark:border-divBorderDark';
	const h2Classes = 'text-xl border-b-2 border-divBorderLight dark:border-divBorderDark';
	const h3Classes = 'text-l border-b-2 border-divBorderLight dark:border-divBorderDark';
	const pClasses = 'my-2 text-normal leading-5';
</script>

<div class="custom-scrollbar fixed bottom-0 top-12 overflow-y-auto px-4 py-2">
	<h1 class={h1Classes}>About Knight Planner</h1>
	<p class={pClasses}>
		Knight Planner is a course schedule planner for University of Central Florida students. It is
		built to search live UCF catalog and myUCF section data, show class meetings and seats, display
		RateMyProfessors ratings when available, and help students compare schedules visually.
	</p>
	<p class={pClasses}>
		This project is a UCF adaptation of Jupiterp's open-source planner experience. It was built by
		Henrique Silva Ribeiro and is currently version 1.0.0 while the UCF release is still being
		polished.
	</p>
	<a href="/changelog" class="text-orange underline">View changelog</a>
	<h2 class={h2Classes}>Professor Ratings</h2>
	<p class={pClasses}>
		Stars next to a professor's name come from RateMyProfessors when a confident match exists.
		Ratings are student-submitted opinions and should be used as one planning signal, not as a
		guarantee of class quality.
	</p>
	<h2 class={h2Classes}>Open Source</h2>
	<p class={pClasses}>
		Knight Planner is open source. Visit the
		<a
			href="https://github.com/Ghostsheep1/ucf-schedule-planner"
			target="_blank"
			class="text-orange underline">GitHub repository</a
		>
		to inspect the code or contribute.
	</p>
	<h2 class={h2Classes}>Credits</h2>
	<p class={pClasses}>
		Course catalog information is sourced from UCF Kuali catalog data. Section, meeting, seat, and
		waitlist information is sourced from myUCF public class search pages when available. Professor
		rating links and scores are sourced from RateMyProfessors.
	</p>
	<h3 class={h3Classes}>Contact</h3>
	<p class={pClasses}>
		To report an issue or suggest an improvement, email
		<code class="rounded-md bg-bgSecondaryLight text-sm dark:bg-bgSecondaryDark">
			hsribeiro1@gmail.com</code
		>.
	</p>
</div>
