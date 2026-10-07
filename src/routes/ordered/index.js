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

	let currentMethod = options.orderedMethod || 'standard';
	let program = initShaderProgram(
		gl,
		vertex_src,
		currentMethod === 'hue_lightness' ? hue_lightness_src : fragment_src
	);

	const { vertex_buffer, index_buffer } = setUpRect(gl);

	/** @type {WebGLTexture} */
	let imageTexture;

	/** @type {WebGLTexture} */
	let thresholdMapTexture;

	/** @type {WebGLTexture} */
	let paletteTexture;

	/** @type {{ width: number, height: number }} */
	let thresholdMapSize;

	/** @type {number | null} */
	let frame = null;

	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

	const loadImage = () => {
		if (imageTexture) {
			gl.deleteTexture(imageTexture);
		}

		imageTexture = textureFromImageData(gl, options.image, gl.LINEAR);
	};

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

	const loadPalette = () => {
		if (paletteTexture) {
			gl.deleteTexture(paletteTexture);
		}

		paletteTexture = textureFromImageData(gl, options.palette, gl.NEAREST);
	};

	loadImage();
	loadThresholdMap();
	loadPalette();

	const render = () => {
		gl.useProgram(program);

		const position_attribute_location = gl.getAttribLocation(program, 'position');
		gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
		gl.vertexAttribPointer(position_attribute_location, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(position_attribute_location);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buffer);

		const uSampler = gl.getUniformLocation(program, 'uSampler');
		const uNoiseSampler = gl.getUniformLocation(program, 'uNoiseSampler');
		const uNoise = gl.getUniformLocation(program, 'uNoise');
		const uSize = gl.getUniformLocation(program, 'uSize');
		const uNoiseSamplerSize = gl.getUniformLocation(program, 'uNoiseSamplerSize');

		gl.viewport(0, 0, options.output_width, options.output_height);
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, imageTexture);
		gl.uniform1i(uSampler, 0);

		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, thresholdMapTexture);
		gl.uniform1i(uNoiseSampler, 1);

		gl.uniform2f(
			uNoiseSamplerSize,
			thresholdMapSize.width,
			thresholdMapSize.height
		);

		gl.uniform1f(uNoise, options.noiseIntensity);
		gl.uniform2f(uSize, options.output_width, options.output_height);

		if (currentMethod === 'standard') {
			const uPaletteSampler = gl.getUniformLocation(program, 'uPaletteSampler');

			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
			gl.uniform1i(uPaletteSampler, 2);
		} else {
			const colors = (options.colors || []).slice(0, 16);
			const uColorCount = gl.getUniformLocation(program, 'uColorCount');
			const uColors = gl.getUniformLocation(program, 'uColors[0]');

			const flattenedColors = new Float32Array(16 * 3);

			colors.forEach((color, index) => {
				flattenedColors[index * 3] = color[0] / 255;
				flattenedColors[index * 3 + 1] = color[1] / 255;
				flattenedColors[index * 3 + 2] = color[2] / 255;
			});

			gl.uniform1i(uColorCount, colors.length);
			gl.uniform3fv(uColors, flattenedColors);
		}

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
	};

	function rebuildProgram() {
		currentMethod = options.orderedMethod || 'standard';

		if (program) {
			gl.deleteProgram(program);
		}

		program = initShaderProgram(
			gl,
			vertex_src,
			currentMethod === 'hue_lightness' ? hue_lightness_src : fragment_src
		);
	}

	function invalidate() {
		if (frame !== null) {
			return;
		}

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
			const thresholdMapChanged = options.thresholdMap !== newOptions.thresholdMap;
			const paletteChanged = options.palette !== newOptions.palette;
			const methodChanged = options.orderedMethod !== newOptions.orderedMethod;

			options = newOptions;

			if (imageHasBeenChanged) loadImage();
			if (thresholdMapChanged) loadThresholdMap();
			if (paletteChanged) loadPalette();
			if (methodChanged) rebuildProgram();

			invalidate();
		},

		destroy() {
			if (frame !== null) cancelAnimationFrame(frame);

			if (imageTexture) gl.deleteTexture(imageTexture);
			if (thresholdMapTexture) gl.deleteTexture(thresholdMapTexture);
			if (paletteTexture) gl.deleteTexture(paletteTexture);
			if (program) gl.deleteProgram(program);
		}
	};
}
