import vertex_src from './vertex.glsl';
import fragment_src from './fragment.glsl';
import hue_lightness_src from './hue-lightness.glsl';
import { initShaderProgram, setUpRect, textureFromImageData } from './utils';
import { derived, writable } from 'svelte/store';

/**
 * @typedef {{
 *  image: ImageData;
 *  thresholdMap: ImageData;
 *  noiseIntensity: number;
 *  palette: ImageData;
 *  colors: import('../utils').RGB[];
 *  orderedMethod: 'standard' | 'hue_lightness';
 *  output_width: number;
 *  output_height: number;
 * }} DitheringOptions
 */

/** @type {import("svelte/store").Writable<WebGLRenderingContext>} */
const __gl_store = writable();
export const glStore = derived(__gl_store, (g) => g);

/**
 *
 * @param {HTMLCanvasElement} canvas
 * @param {DitheringOptions} initialOptions
 * @returns
 */
export function orderedDithering(canvas, initialOptions) {
	let options = initialOptions;

	/**
	 * @type {WebGLRenderingContext | null}
	 */
	const gl = canvas.getContext('webgl', {
		preserveDrawingBuffer: true //Needed to save the canvas as an image
	});

	if (!gl) {
		alert('WebGL not supported');
		return;
	}

	__gl_store.set(gl);

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	/*
	 * Compile both programs once.
	 * Switching method only selects an existing program.
	 */
	const standardProgram = initShaderProgram(gl, vertex_src, fragment_src);
	const hueLightnessProgram = initShaderProgram(gl, vertex_src, hue_lightness_src);

	const { vertex_buffer, index_buffer } = setUpRect(gl);

	/**
	 * Set up and return all locations needed by a program.
	 *
	 * @param {WebGLProgram} program
	 */
	function getProgramLocations(program) {
		gl.useProgram(program);

		const position_attribute_location = gl.getAttribLocation(program, 'position');

		gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
		gl.vertexAttribPointer(position_attribute_location, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(position_attribute_location);

		return {
			position_attribute_location,
			uSampler: gl.getUniformLocation(program, 'uSampler'),
			uNoiseSampler: gl.getUniformLocation(program, 'uNoiseSampler'),
			uNoise: gl.getUniformLocation(program, 'uNoise'),
			uSize: gl.getUniformLocation(program, 'uSize'),
			uNoiseSamplerSize: gl.getUniformLocation(program, 'uNoiseSamplerSize'),
			uPaletteSampler: gl.getUniformLocation(program, 'uPaletteSampler'),
			uColorCount: gl.getUniformLocation(program, 'uColorCount'),
			uColors: gl.getUniformLocation(program, 'uColors[0]')
		};
	}

	const standardLocations = getProgramLocations(standardProgram);
	const hueLightnessLocations = getProgramLocations(hueLightnessProgram);

	/** @type {WebGLTexture} */
	let imageTexture;
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

	const loadImage = () => {
		if (imageTexture) {
			gl.deleteTexture(imageTexture);
		}

		imageTexture = textureFromImageData(gl, options.image, gl.LINEAR);
	};

	loadImage();

	/** @type {WebGLTexture} */
	let thresholdMapTexture;

	/** @type {{ width: number, height: number }} */
	let thresholdMapSize;

	const loadThresholdMap = () => {
		if (thresholdMapTexture) {
			gl.deleteTexture(thresholdMapTexture);
		}

		thresholdMapTexture = textureFromImageData(gl, options.thresholdMap, gl.NEAREST);
		thresholdMapSize = {
			width: options.thresholdMap.width,
			height: options.thresholdMap.height
		};
	};

	loadThresholdMap();

	/** @type {WebGLTexture} */
	let paletteTexture;

	const loadPalette = () => {
		if (paletteTexture) {
			gl.deleteTexture(paletteTexture);
		}

		paletteTexture = textureFromImageData(gl, options.palette, gl.NEAREST);
	};

	loadPalette();

	/** @type {number | null} */
	let frame = null;

	const render = () => {
		const useHueLightness = options.orderedMethod === 'hue_lightness';

		const program = useHueLightness
			? hueLightnessProgram
			: standardProgram;

		const locations = useHueLightness
			? hueLightnessLocations
			: standardLocations;

		gl.useProgram(program);

		/*
		 * Restore the vertex attribute for the currently selected program.
		 */
		gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
		gl.vertexAttribPointer(
			locations.position_attribute_location,
			2,
			gl.FLOAT,
			false,
			0,
			0
		);
		gl.enableVertexAttribArray(locations.position_attribute_location);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buffer);

		gl.viewport(0, 0, options.output_width, options.output_height);
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		// Original image
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, imageTexture);
		gl.uniform1i(locations.uSampler, 0);

		// Threshold map
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, thresholdMapTexture);
		gl.uniform1i(locations.uNoiseSampler, 1);

		gl.uniform2f(
			locations.uNoiseSamplerSize,
			thresholdMapSize.width,
			thresholdMapSize.height
		);

		gl.uniform1f(locations.uNoise, options.noiseIntensity);
		gl.uniform2f(
			locations.uSize,
			options.output_width,
			options.output_height
		);

		if (useHueLightness) {
			/*
			 * Hue-Lightness receives the real selected palette colours.
			 * Maximum 16 colours.
			 */
			const colors = (options.colors || []).slice(0, 16);
			const flattenedColors = new Float32Array(16 * 3);

			colors.forEach((color, index) => {
				flattenedColors[index * 3] = color[0] / 255;
				flattenedColors[index * 3 + 1] = color[1] / 255;
				flattenedColors[index * 3 + 2] = color[2] / 255;
			});

			gl.uniform1i(locations.uColorCount, colors.length);
			gl.uniform3fv(locations.uColors, flattenedColors);
		} else {
			/*
			 * Standard retains Loris's original palette texture.
			 */
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
			gl.uniform1i(locations.uPaletteSampler, 2);
		}

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
	};

	function invalidate() {
		frame = requestAnimationFrame(() => {
			render();
			frame = null;
		});
	}

	invalidate();

	return {
		/**
		 * @param {DitheringOptions} newOptions
		 */
		update(newOptions) {
			const imageHasBeenChanged = options.image !== newOptions.image;
			const thresholdMapChanged =
				options.thresholdMap !== newOptions.thresholdMap;
			const paletteChanged = options.palette !== newOptions.palette;

			options = newOptions;

			if (imageHasBeenChanged) loadImage();

			if (thresholdMapChanged) loadThresholdMap();

			if (paletteChanged) loadPalette();

			/*
			 * Exactly like the original renderer:
			 * schedule a render after an update.
			 */
			invalidate();
		},

		destroy() {
			if (frame !== null) cancelAnimationFrame(frame);

			if (imageTexture) gl.deleteTexture(imageTexture);
			if (thresholdMapTexture) gl.deleteTexture(thresholdMapTexture);
			if (paletteTexture) gl.deleteTexture(paletteTexture);

			gl.deleteProgram(standardProgram);
			gl.deleteProgram(hueLightnessProgram);
		}
	};
}
