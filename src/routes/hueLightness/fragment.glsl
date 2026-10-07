precision highp float;

varying vec2 fragCoord;

uniform sampler2D uSampler;
uniform sampler2D uNoiseSampler;

uniform vec2 uNoiseSamplerSize;
uniform float uNoise;
uniform vec2 uSize;

uniform vec3 uColors[16];
uniform int uColorCount;

vec3 rgbToHsl(vec3 c) {
	float maxC = max(c.r, max(c.g, c.b));
	float minC = min(c.r, min(c.g, c.b));
	float delta = maxC - minC;

	float h = 0.0;
	float s = 0.0;
	float l = (maxC + minC) * 0.5;

	if (delta > 0.00001) {
		s = l < 0.5
			? delta / (maxC + minC)
			: delta / (2.0 - maxC - minC);

		if (maxC == c.r) {
			h = (c.g - c.b) / delta;

			if (c.g < c.b) {
				h += 6.0;
			}
		} else if (maxC == c.g) {
			h = (c.b - c.r) / delta + 2.0;
		} else {
			h = (c.r - c.g) / delta + 4.0;
		}

		h /= 6.0;
	}

	return vec3(h, s, l);
}

float hueDistance(float a, float b) {
	float d = abs(a - b);
	return min(d, 1.0 - d);
}

float colorDistance(vec3 sourceHsl, vec3 paletteHsl) {
	float hueWeight = max(sourceHsl.y, paletteHsl.y);

	float dh = hueDistance(sourceHsl.x, paletteHsl.x);
	float ds = sourceHsl.y - paletteHsl.y;
	float dl = sourceHsl.z - paletteHsl.z;

	return
		(dh * dh * 2.0 * hueWeight) +
		(ds * ds * 0.35) +
		(dl * dl * 1.5);
}

void main(void) {
	vec2 imgPixel = vec2(
		fragCoord.x * uSize.x,
		fragCoord.y * uSize.y
	);

	vec2 noisePixel = vec2(
		mod(imgPixel.x, uNoiseSamplerSize.x),
		mod(imgPixel.y, uNoiseSamplerSize.y)
	);

	vec2 noiseUV = vec2(
		noisePixel.x / uNoiseSamplerSize.x,
		noisePixel.y / uNoiseSamplerSize.y
	);

	float threshold = texture2D(uNoiseSampler, noiseUV).r;

	vec3 source = texture2D(uSampler, fragCoord).rgb;
	vec3 sourceHsl = rgbToHsl(source);

	int bestIndex = 0;
	int secondIndex = 0;

	float bestDistance = 1000.0;
	float secondDistance = 1000.0;

	for (int i = 0; i < 16; i++) {
		if (i < uColorCount) {
			vec3 paletteHsl = rgbToHsl(uColors[i]);
			float distance = colorDistance(sourceHsl, paletteHsl);

			if (distance < bestDistance) {
				secondDistance = bestDistance;
				secondIndex = bestIndex;

				bestDistance = distance;
				bestIndex = i;
			} else if (distance < secondDistance) {
				secondDistance = distance;
				secondIndex = i;
			}
		}
	}

	float totalDistance = bestDistance + secondDistance;
	float mixAmount = 0.0;

	if (totalDistance > 0.00001) {
		mixAmount = bestDistance / totalDistance;
	}

	mixAmount = clamp(mixAmount * uNoise, 0.0, 1.0);

	vec3 outputColor = uColors[0];

	for (int i = 0; i < 16; i++) {
		if (i == bestIndex) {
			outputColor = uColors[i];
		}
	}

	if (threshold < mixAmount) {
		for (int i = 0; i < 16; i++) {
			if (i == secondIndex) {
				outputColor = uColors[i];
			}
		}
	}

	gl_FragColor = vec4(outputColor, 1.0);
}
