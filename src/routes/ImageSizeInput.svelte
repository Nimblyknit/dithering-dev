<script>
	import { ID } from '$lib/math/id-generation.js';
	import { Icon, LockClosed, LockOpen } from 'svelte-hero-icons';

	/** @type {number} */
	export let width;
	/** @type {number} */
	export let height;
	/** @type {number} */
	export let aspectRatio;

	/** @type {number | null} */
	export let maxWidth = null;
	/** @type {number | null} */
	export let maxHeight = null;

	/** @type {number | null} */
	export let minWidth = null;
	/** @type {number | null} */
	export let minHeight = null;

	/** @type {boolean} */
	export let disabled = false;

	let aspectRatioLocked = true;

	/** @param {any} e */
	function onWidthInput(e) {
		const newWidth = Number(e.target.value);
		if (!newWidth) return;
		if (minWidth !== null && newWidth < minWidth) return;
		if (maxWidth !== null && newWidth > maxWidth) return;

		width = newWidth;

		if (aspectRatioLocked) {
			height = Math.round(width / aspectRatio);
		}
	}

	/** @param {any} e */
	function onHeightInput(e) {
		const newHeight = Number(e.target.value);
		if (!newHeight) return;
		if (minHeight !== null && newHeight < minHeight) return;
		if (maxHeight !== null && newHeight > maxHeight) return;

		height = newHeight;

		if (aspectRatioLocked) {
			width = Math.round(aspectRatio * height);
		}
	}

	let withId = ID();
	let heightId = ID();
</script>

<fieldset class="flex items-end justify-between gap-3">
	<div class="w-full">
		<label
			for="width-{withId}"
			class="block text-sm font-medium leading-6 {disabled ? 'text-gray-400' : 'text-gray-900'}"
			>Width</label
		>
		<div class="relative mt-2 rounded-md {disabled ? 'shadow-none' : 'shadow-sm'}">
			<input
				name="width"
				id="width-{withId}"
				type="number"
				min={minWidth}
				max={maxWidth}
				{disabled}
				step="1"
				value={width}
				on:input={onWidthInput}
				class="block w-full rounded-md border-0 py-1.5 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-white
				disabled:text-gray-400 disabled:ring-gray-200 sm:text-sm sm:leading-6"
				placeholder="600"
			/>
			<div
				class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400"
			>
				px
			</div>
		</div>
	</div>

	<button
		type="button"
		on:click={() => (aspectRatioLocked = !aspectRatioLocked)}
		disabled={disabled}
		class="pb-2 {disabled ? 'cursor-not-allowed text-gray-300' : 'cursor-pointer text-gray-500'}"
		title={aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
	>
		<Icon
			src={aspectRatioLocked ? LockClosed : LockOpen}
			class="h-4 w-4"
			solid
		/>
	</button>

	<div class="w-full">
		<label
			for="height-{heightId}"
			class="block text-sm font-medium leading-6 {disabled ? 'text-gray-400' : 'text-gray-900'}"
			>Height</label
		>
		<div class="relative mt-2 rounded-md {disabled ? 'shadow-none' : 'shadow-sm'}">
			<input
				type="number"
				id="height-{heightId}"
				name="height"
				min={minHeight}
				max={maxHeight}
				step="1"
				value={height}
				{disabled}
				on:input={onHeightInput}
				class="block w-full rounded-md border-0 py-1.5 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-white
				disabled:text-gray-400 disabled:ring-gray-200 sm:text-sm sm:leading-6"
				placeholder="340"
			/>
			<div
				class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400"
			>
				px
			</div>
		</div>
	</div>
</fieldset>
