import vertex_src from '../ordered/vertex.glsl';
import fragment_src from './fragment.glsl';
import {
	initShaderProgram,
	setUpRect,
	textureFromImageData
} from '../ordered/utils';
import { derived, writable } from 'svelte/store';

/**
 * @typedef {{
 *  image: ImageData;
 *  thresholdMap: ImageData;
 *  noiseIntensity: number;
 *  colors: number[][];
 *  output_width: number;
 *  output_height: number;
 * }} HueLightnessOptions
 */

/** @type {import("svelte/store").Writable<WebGLRenderingContext>} */
const __hue_gl_store = writable();

export const hueGlStore =
	derived(__hue_gl_store, (g) => g);

/**
 * Convert one RGB palette colour to HSL.
 *
 * RGB input is 0-255.
 * HSL output is 0-1.
 *
 * @param {number[]} color
 * @returns {number[]}
 */
function rgbToHsl(color) {
	const r = color[0] / 255;
	const g = color[1] / 255;
	const b = color[2] / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;

	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (delta > 0.00001) {
		s =
			l < 0.5
				? delta / (max + min)
				: delta / (2 - max - min);

		if (max === r) {
			h = (g - b) / delta;

			if (g < b) {
				h += 6;
			}
		} else if (max === g) {
			h = (b - r) / delta + 2;
		} else {
			h = (r - g) / delta + 4;
		}

		h /= 6;
	}

	return [h, s, l];
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HueLightnessOptions} initialOptions
 */
export function hueLightnessDithering(
	canvas,
	initialOptions
) {
	let options = initialOptions;

	/**
	 * @type {WebGLRenderingContext | null}
	 */
	const gl = canvas.getContext('webgl', {
		preserveDrawingBuffer: true
	});

	if (!gl) {
		alert('WebGL not supported');
		return;
	}

	__hue_gl_store.set(gl);

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	const program =
		initShaderProgram(
			gl,
			vertex_src,
			fragment_src
		);

	const {
		vertex_buffer,
		index_buffer
	} = setUpRect(gl);

	gl.useProgram(program);

	const position_attribute_location =
		gl.getAttribLocation(
			program,
			'position'
		);

	gl.vertexAttribPointer(
		position_attribute_location,
		2,
		gl.FLOAT,
		false,
		0,
		0
	);

	gl.enableVertexAttribArray(
		position_attribute_location
	);

	const uSampler =
		gl.getUniformLocation(
			program,
			'uSampler'
		);

	const uNoiseSampler =
		gl.getUniformLocation(
			program,
			'uNoiseSampler'
		);

	const uNoise =
		gl.getUniformLocation(
			program,
			'uNoise'
		);

	const uSize =
		gl.getUniformLocation(
			program,
			'uSize'
		);

	const uNoiseSamplerSize =
		gl.getUniformLocation(
			program,
			'uNoiseSamplerSize'
		);

	const uColorCount =
		gl.getUniformLocation(
			program,
			'uColorCount'
		);

	const uColors =
		gl.getUniformLocation(
			program,
			'uColors[0]'
		);

	const uColorsHsl =
		gl.getUniformLocation(
			program,
			'uColorsHsl[0]'
		);

	/** @type {WebGLTexture} */
	let imageTexture;

	gl.pixelStorei(
		gl.UNPACK_FLIP_Y_WEBGL,
		true
	);

	const loadImage = () => {
		if (imageTexture) {
			gl.deleteTexture(
				imageTexture
			);
		}

		imageTexture =
			textureFromImageData(
				gl,
				options.image,
				gl.LINEAR
			);
	};

	loadImage();

	/** @type {WebGLTexture} */
	let thresholdMapTexture;

	/** @type {{ width: number, height: number }} */
	let thresholdMapSize;

	const loadThresholdMap = () => {
		if (thresholdMapTexture) {
			gl.deleteTexture(
				thresholdMapTexture
			);
		}

		thresholdMapTexture =
			textureFromImageData(
				gl,
				options.thresholdMap,
				gl.NEAREST
			);

		thresholdMapSize = {
			width:
				options.thresholdMap.width,
			height:
				options.thresholdMap.height
		};
	};

	loadThresholdMap();

	/** @type {number | null} */
	let frame = null;

	const render = () => {
		gl.viewport(
			0,
			0,
			options.output_width,
			options.output_height
		);

		gl.clearColor(
			0.0,
			0.0,
			0.0,
			1.0
		);

		gl.clear(
			gl.COLOR_BUFFER_BIT
		);

		gl.bindBuffer(
			gl.ARRAY_BUFFER,
			vertex_buffer
		);

		gl.bindBuffer(
			gl.ELEMENT_ARRAY_BUFFER,
			index_buffer
		);

		/*
		 * Original image
		 */
		gl.activeTexture(
			gl.TEXTURE0
		);

		gl.bindTexture(
			gl.TEXTURE_2D,
			imageTexture
		);

		gl.uniform1i(
			uSampler,
			0
		);

		/*
		 * Threshold map
		 */
		gl.activeTexture(
			gl.TEXTURE1
		);

		gl.bindTexture(
			gl.TEXTURE_2D,
			thresholdMapTexture
		);

		gl.uniform1i(
			uNoiseSampler,
			1
		);

		gl.uniform2f(
			uNoiseSamplerSize,
			thresholdMapSize.width,
			thresholdMapSize.height
		);

		gl.uniform1f(
			uNoise,
			options.noiseIntensity
		);

		gl.uniform2f(
			uSize,
			options.output_width,
			options.output_height
		);

		/*
		 * Maximum 16 actual yarn colours.
		 */
		const colors =
			(options.colors || [])
				.slice(0, 16);

		const rgbValues =
			new Float32Array(16 * 3);

		const hslValues =
			new Float32Array(16 * 3);

		colors.forEach(
			(color, index) => {
				rgbValues[
					index * 3
				] = color[0] / 255;

				rgbValues[
					index * 3 + 1
				] = color[1] / 255;

				rgbValues[
					index * 3 + 2
				] = color[2] / 255;

				const hsl =
					rgbToHsl(color);

				hslValues[
					index * 3
				] = hsl[0];

				hslValues[
					index * 3 + 1
				] = hsl[1];

				hslValues[
					index * 3 + 2
				] = hsl[2];
			}
		);

		gl.uniform1i(
			uColorCount,
			colors.length
		);

		gl.uniform3fv(
			uColors,
			rgbValues
		);

		gl.uniform3fv(
			uColorsHsl,
			hslValues
		);

		gl.clear(
			gl.COLOR_BUFFER_BIT |
			gl.DEPTH_BUFFER_BIT
		);

		gl.drawElements(
			gl.TRIANGLES,
			6,
			gl.UNSIGNED_SHORT,
			0
		);
	};

	function invalidate() {
		if (frame !== null) {
			return;
		}

		frame =
			requestAnimationFrame(
				() => {
					render();
					frame = null;
				}
			);
	}

	invalidate();

	return {
		/**
		 * @param {HueLightnessOptions} newOptions
		 */
		update(newOptions) {
			const imageHasBeenChanged =
				options.image !==
				newOptions.image;

			const thresholdMapChanged =
				options.thresholdMap !==
				newOptions.thresholdMap;

			options = newOptions;

			if (imageHasBeenChanged) {
				loadImage();
			}

			if (thresholdMapChanged) {
				loadThresholdMap();
			}

			invalidate();
		},

		destroy() {
			if (frame !== null) {
				cancelAnimationFrame(
					frame
				);
			}

			if (imageTexture) {
				gl.deleteTexture(
					imageTexture
				);
			}

			if (thresholdMapTexture) {
				gl.deleteTexture(
					thresholdMapTexture
				);
			}

			gl.deleteProgram(
				program
			);
		}
	};
}
