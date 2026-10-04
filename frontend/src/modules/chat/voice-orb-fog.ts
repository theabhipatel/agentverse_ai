const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

/**
 * A sky inside a sphere: deep at the top, light at the bottom, with fog that
 * drifts sideways and keeps changing shape because the noise warps itself.
 */
const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_core;
uniform vec3 u_deep;
uniform vec3 u_mid;
uniform vec3 u_light;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), u.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    total += amplitude * noise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = uv * 2.0 - 1.0;
  float radius = length(p);
  // The edge fades over a few pixels, so it stays smooth when the orb is shown small.
  float inside = 1.0 - smoothstep(1.0 - 5.0 / u_resolution.x, 1.0, radius);

  // Sky: soft at the bottom, deepening to the top.
  vec3 color = mix(mix(u_mid, u_light, 0.55), u_mid, smoothstep(0.0, 0.5, uv.y));
  color = mix(color, mix(u_deep, u_core, 0.45), smoothstep(0.45, 1.0, uv.y));

  // Fog: long streaks drifting sideways, warped by more noise so they keep changing shape.
  vec2 q = vec2(p.x * 0.9 - u_time * 0.08, p.y * 3.0);
  vec2 warp = vec2(fbm(q + vec2(0.0, u_time * 0.05)), fbm(q + vec2(5.2, 1.3 - u_time * 0.04)));
  float fog = smoothstep(0.3, 0.62, fbm(q + 1.8 * warp));
  // A band of cloud through the middle, thinning above and below it.
  float band = exp(-pow((uv.y - 0.42) / 0.22, 2.0));
  color = mix(color, u_light, 0.95 * fog * band);

  // Deeper towards the rim, so it reads as a sphere.
  color = mix(color, u_core, 0.25 * smoothstep(0.6, 1.0, radius));

  gl_FragColor = vec4(color * inside, inside);
}
`

/** The theme tokens the shader paints with. They are the same in both themes, so they are read once. */
const COLOR_TOKENS = {
  u_core: '--voice-orb-core',
  u_deep: '--voice-orb-deep',
  u_mid: '--voice-orb-mid',
  u_light: '--voice-orb-light',
} as const

/** The canvas is drawn at no more than this many pixels per CSS pixel. */
const MAX_PIXEL_RATIO = 2

export interface OrbFog {
  /** Paints one frame. `time` is how far the fog has drifted, in seconds. */
  draw: (time: number) => void
  dispose: () => void
}

/** A token's colour as red, green and blue from 0 to 1. A 2D canvas does the conversion from any CSS colour. */
function tokenColor(element: Element, token: string, probe: CanvasRenderingContext2D): [number, number, number] {
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = getComputedStyle(element).getPropertyValue(token).trim()
  probe.fillRect(0, 0, 1, 1)
  const [red, green, blue] = probe.getImageData(0, 0, 1, 1).data
  return [red / 255, green / 255, blue / 255]
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) {
    return null
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
}

/**
 * Paints the orb's sky and fog into a canvas with WebGL. Returns null where
 * WebGL is not available, and calls `onLost` if the GPU drops the context, so
 * the orb can fall back to its plain gradient.
 */
export function createOrbFog(canvas: HTMLCanvasElement, onLost: () => void): OrbFog | null {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: true })
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!gl || !probe) {
    return null
  }

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) {
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null
  }
  gl.useProgram(program)

  // Two triangles covering the whole canvas. The shader does the rest.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  for (const [uniform, token] of Object.entries(COLOR_TOKENS)) {
    gl.uniform3fv(gl.getUniformLocation(program, uniform), tokenColor(canvas, token, probe))
  }
  const resolution = gl.getUniformLocation(program, 'u_resolution')
  const time = gl.getUniformLocation(program, 'u_time')

  canvas.addEventListener('webglcontextlost', onLost, { once: true })

  return {
    draw: (seconds) => {
      const size = Math.max(1, Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO)))
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size
        canvas.height = size
        gl.viewport(0, 0, size, size)
      }
      gl.uniform2f(resolution, size, size)
      gl.uniform1f(time, seconds)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose: () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
