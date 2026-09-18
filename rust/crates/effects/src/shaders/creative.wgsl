struct VertexOutput { @builtin(position) position: vec4f, @location(0) tex_coord: vec2f }
struct Uniforms { resolution: vec2f, direction: vec2f, controls: vec4f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;
@group(1) @binding(0) var<uniform> u: Uniforms;
fn noise(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898,78.233))) * 43758.5453); }
@fragment fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let uv = input.tex_coord; let original = textureSample(source, source_sampler, uv);
    let mode = u32(u.controls.x); let amount = u.controls.y; let detail = u.controls.z;
    var rgb = original.rgb;
    if mode == 1u { let distance = length((uv - 0.5) * vec2f(1.0, u.resolution.y/u.resolution.x)); let vignette = smoothstep(clamp(detail,0.05,0.8) * 0.35, 0.72, distance); rgb *= 1.0 - vignette * amount; }
    else if mode == 2u { let grain = (noise(floor(uv*u.resolution/max(detail,1.0))) - 0.5) * amount; rgb += grain; }
    else if mode == 3u { let cell = max(amount,1.0); let p = (floor(uv*u.resolution/cell)+0.5)*cell/u.resolution; rgb = textureSample(source,source_sampler,p).rgb; }
    else if mode == 4u { let offset = vec2f(amount/u.resolution.x,0.0); rgb.r = textureSample(source,source_sampler,uv+offset).r; rgb.b = textureSample(source,source_sampler,uv-offset).b; }
    else if mode == 5u { let d = max(detail,1.0)/u.resolution; let average = (textureSample(source,source_sampler,uv+vec2f(d.x,0.0)).rgb+textureSample(source,source_sampler,uv-vec2f(d.x,0.0)).rgb+textureSample(source,source_sampler,uv+vec2f(0.0,d.y)).rgb+textureSample(source,source_sampler,uv-vec2f(0.0,d.y)).rgb)*0.25; rgb += (rgb-average)*amount; }
    else if mode == 6u { rgb = mix(rgb, vec3f(dot(rgb,vec3f(0.393,0.769,0.189)),dot(rgb,vec3f(0.349,0.686,0.168)),dot(rgb,vec3f(0.272,0.534,0.131))), amount); }
    else if mode == 7u { let levels = max(round(amount),2.0); rgb = round(rgb*(levels-1.0))/(levels-1.0); }
    else if mode == 8u { let luma = dot(rgb,vec3f(0.2126,0.7152,0.0722)); rgb = mix(rgb,mix(vec3f(0.04,0.07,0.18),vec3f(1.0,0.78,0.24),pow(max(luma,0.0),max(detail,0.1))),amount); }
    return vec4f(mix(original.rgb,clamp(rgb,vec3f(0.0),vec3f(1.0)),u.controls.w),original.a);
}
