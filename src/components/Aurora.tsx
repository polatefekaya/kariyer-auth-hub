import { onMount, onCleanup, mergeProps, createMemo } from 'solid-js';
import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ), 
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \
  int index = 0;                                            \
  for (int i = 0; i < 2; i++) {                               \
     ColorStop currentColor = colors[i];                    \
     bool isInBetween = currentColor.position <= factor;    \
     index = int(mix(float(index), float(i), float(isInBetween))); \
  }                                                         \
  ColorStop currentColor = colors[index];                   \
  ColorStop nextColor = colors[index + 1];                  \
  float range = nextColor.position - currentColor.position; \
  float lerpFactor = (factor - currentColor.position) / range; \
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  
  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);
  
  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);
  
  // Calculate the physical aspect ratio
  float aspect = uResolution.x / uResolution.y;
  
  // THE FIX: Dynamically scale the amplitude down on portrait/narrow screens.
  // min(1.0, aspect) ensures that desktop (landscape) remains untouched at 1.0,
  // but mobile (e.g., aspect 0.46) reduces the amplitude by 54%.
  float dynamicAmp = uAmplitude * min(1.0, aspect);
  
  // Revert the X-axis to raw uv.x so the mathematical baseline stays perfectly anchored.
  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * dynamicAmp;
  height = exp(height);
  
  // This vertical anchor is now 100% stable again.
  height = (uv.y * 2.0 - height + 0.2);
  
  float intensity = 0.6 * height;
  float midPoint = 0.20;
  
  float auroraAlpha = smoothstep(midPoint - uBlend * 1.5, midPoint + uBlend * 1.5, intensity);
  
  // Vertical edge fading to prevent clipping if the amplitude spikes
  float edgeFade = smoothstep(0.0, 0.15, uv.y) * smoothstep(1.0, 1.85, uv.y);
  auroraAlpha *= edgeFade;
  
  float maxOpacity = 0.6; 
  auroraAlpha *= maxOpacity;
  
  fragColor = vec4(rampColor * auroraAlpha, auroraAlpha);
}
`;

export interface AuroraProps {
  colorStops?: string[];
  amplitude?: number;
  blend?: number;
  time?: number;
  speed?: number;
}

export default function Aurora(props: AuroraProps) {
  let ctnDom!: HTMLDivElement;

  // Set robust defaults securely merged with incoming props
  const merged = mergeProps(
    {
      colorStops: ['#5227FF', '#7cff67', '#5227FF'],
      amplitude: 1.0,
      blend: 0.5,
      speed: 1.0,
    },
    props
  );

  // Pre-compute colors reactively. 
  // This prevents object instantiation inside the 60fps render loop.
  const parsedColorStops = createMemo(() =>
    merged.colorStops.map((hex) => {
      const c = new Color(hex);
      return [c.r, c.g, c.b];
    })
  );

  onMount(() => {
    // 1. Initialize WebGL Context
    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      dpr: window.devicePixelRatio || 1, // Fixes blurry output on high-DPI displays
    });

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.backgroundColor = 'transparent';

    ctnDom.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    // Remove unused UVs if strictly unnecessary per original logic
    if (geometry.attributes.uv) {
      delete geometry.attributes.uv;
    }

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: merged.amplitude },
        uColorStops: { value: parsedColorStops() },
        uResolution: { value: [ctnDom.offsetWidth, ctnDom.offsetHeight] },
        uBlend: { value: merged.blend },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    // 2. Resize Logic using ResizeObserver
    // Handles layout shifts without relying on global window resizes.
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        renderer.setSize(width, height);
        program.uniforms.uResolution.value = [width, height];
      }
    });
    resizeObserver.observe(ctnDom);

    // 3. Render Loop
    let animateId = 0;
    const update = (t: number) => {
      animateId = requestAnimationFrame(update);

      // Extract time logic - allow manual override or auto-advance
      const currentTime = merged.time !== undefined ? merged.time : t * 0.01;

      // Update uniforms reactively via Solid's proxy getters.
      // No closures or stale references to fight.
      program.uniforms.uTime.value = currentTime * merged.speed * 0.1;
      program.uniforms.uAmplitude.value = merged.amplitude;
      program.uniforms.uBlend.value = merged.blend;
      program.uniforms.uColorStops.value = parsedColorStops();

      renderer.render({ scene: mesh });
    };

    animateId = requestAnimationFrame(update);

    // 4. Teardown
    onCleanup(() => {
      cancelAnimationFrame(animateId);
      resizeObserver.disconnect();
      
      if (gl.canvas.parentNode === ctnDom) {
        ctnDom.removeChild(gl.canvas);
      }
      
      // Explicitly free WebGL resources to avoid browser-level memory leaks
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    });
  });

  // Note: Solid uses `class` instead of `className`
  return <div ref={ctnDom} class="w-full h-full" />;
}