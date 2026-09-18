struct AdvancedGrade {
    extra: vec4f,
    lut_info: vec4f,
    lut_min: vec4f,
    lut_max: vec4f,
    bars: array<vec4f, 4>,
    mixer: array<vec4f, 3>,
    qualifier: array<vec4f, 3>,
    window: array<vec4f, 2>,
    detail: vec4f,
    log: vec4f,
    curves: array<vec4f, 64>,
    hue_curves: array<vec4f, 64>,
    sat_curves: array<vec4f, 64>,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    resolution: vec2f,
    direction: vec2f,
    scalars: vec4f,
    lift: vec4f,
    gamma: vec4f,
    gain: vec4f,
    offset: vec4f,
    primary: vec4f, // exposure, contrast, saturation, temperature
    secondary: vec4f, // tint, pivot, shadows, highlights
    advanced: AdvancedGrade,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;
@group(2) @binding(0) var lut_texture: texture_2d<f32>;

fn wheel(balance: vec2f) -> vec3f {
    return vec3f(balance.x, dot(balance, vec2f(-0.5, 0.8660254)), dot(balance, vec2f(-0.5, -0.8660254)));
}

fn luminance(rgb: vec3f) -> f32 { return dot(rgb, vec3f(0.2126, 0.7152, 0.0722)); }
fn hsv(rgb: vec3f) -> vec3f {
    let maximum = max(rgb.r, max(rgb.g, rgb.b));
    let minimum = min(rgb.r, min(rgb.g, rgb.b));
    let delta = maximum - minimum;
    var hue = 0.0;
    if delta > 0.00001 {
        if maximum == rgb.r { hue = (rgb.g - rgb.b) / delta; }
        else if maximum == rgb.g { hue = 2.0 + (rgb.b - rgb.r) / delta; }
        else { hue = 4.0 + (rgb.r - rgb.g) / delta; }
        hue = fract(hue / 6.0 + 1.0);
    }
    return vec3f(hue, select(0.0, delta / max(maximum, 0.00001), maximum > 0.0), maximum);
}
fn from_hsv(value: vec3f) -> vec3f {
    let p = abs(fract(value.xxx + vec3f(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return value.z * mix(vec3f(1.0), clamp(p - 1.0, vec3f(0.0), vec3f(1.0)), value.y);
}
fn curve(value: f32, channel: u32, family: u32) -> f32 {
    let p = clamp(value, 0.0, 1.0) * 63.0;
    let lo = u32(floor(p)); let hi = min(lo + 1u, 63u);
    if family == 1u { return mix(uniforms.advanced.hue_curves[lo][channel], uniforms.advanced.hue_curves[hi][channel], fract(p)); }
    if family == 2u { return mix(uniforms.advanced.sat_curves[lo][channel], uniforms.advanced.sat_curves[hi][channel], fract(p)); }
    return mix(uniforms.advanced.curves[lo][channel], uniforms.advanced.curves[hi][channel], fract(p));
}
fn range_key(value: f32, low: f32, high: f32, soft: f32) -> f32 {
    if low > high { return 0.0; }
    let lower = select(smoothstep(low - soft, low, value), 1.0, low <= 0.0);
    let upper = select(1.0 - smoothstep(high, high + soft, value), 1.0, high >= 1.0);
    return lower * upper;
}
fn matte(rgb: vec3f, uv: vec2f) -> f32 {
    let q = uniforms.advanced.qualifier;
    var key = 1.0;
    if q[0].x > 0.5 {
        let h = hsv(rgb);
        let distance = min(abs(h.x - q[0].y), 1.0 - abs(h.x - q[0].y));
        let hue_key = 1.0 - smoothstep(q[0].z * 0.5, q[0].z * 0.5 + q[0].w, distance);
        key = hue_key * range_key(h.y, q[1].x, q[1].y, q[0].w) * range_key(luminance(rgb), q[1].z, q[1].w, q[0].w);
        if q[2].x > 0.5 { key = 1.0 - key; }
    }
    let w = uniforms.advanced.window;
    if w[0].x > 0.5 {
        let p = uv - w[0].yz;
        let rotated = vec2f(cos(w[1].y) * p.x + sin(w[1].y) * p.y, -sin(w[1].y) * p.x + cos(w[1].y) * p.y);
        let local = rotated / (vec2f(w[0].w, w[1].x) * 0.5);
        var shape = 1.0;
        if w[0].x < 1.5 { shape = 1.0 - smoothstep(1.0 - w[1].z, 1.0 + w[1].z, length(local)); }
        else if w[0].x < 2.5 { shape = 1.0 - smoothstep(1.0 - w[1].z, 1.0 + w[1].z, max(abs(local.x), abs(local.y))); }
        else { shape = smoothstep(-w[1].z, w[1].z, local.y); }
        if w[1].w > 0.5 { shape = 1.0 - shape; }
        key *= shape;
    }
    return key * q[2].y;
}

fn lut_sample(p: vec3i, size: i32) -> vec3f {
    let width = i32(textureDimensions(lut_texture).x);
    let index = p.x + p.y * size + p.z * size * size;
    return textureLoad(lut_texture, vec2i(index % width, index / width), 0).rgb;
}
fn apply_lut(rgb: vec3f) -> vec3f {
    let a = uniforms.advanced;
    let size = i32(a.lut_info.x);
    if size < 2 { return rgb; }
    let normalized = clamp((rgb - a.lut_min.rgb) / max(a.lut_max.rgb - a.lut_min.rgb, vec3f(0.00001)), vec3f(0.0), vec3f(1.0));
    let p = normalized * f32(size - 1); let lo = vec3i(floor(p)); let hi = min(lo + 1, vec3i(size - 1)); let f = fract(p);
    let c00 = mix(lut_sample(lo,size),lut_sample(vec3i(hi.x,lo.y,lo.z),size),f.x);
    let c10 = mix(lut_sample(vec3i(lo.x,hi.y,lo.z),size),lut_sample(vec3i(hi.x,hi.y,lo.z),size),f.x);
    let c01 = mix(lut_sample(vec3i(lo.x,lo.y,hi.z),size),lut_sample(vec3i(hi.x,lo.y,hi.z),size),f.x);
    let c11 = mix(lut_sample(vec3i(lo.x,hi.y,hi.z),size),lut_sample(hi,size),f.x);
    return mix(rgb,mix(mix(c00,c10,f.y),mix(c01,c11,f.y),f.z),a.lut_info.y);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let sample_color = textureSample(input_texture, input_sampler, input.tex_coord);
    var rgb = sample_color.rgb;
    let a = uniforms.advanced;
    if a.detail.w > 0.5 {
        return vec4f(vec3f(matte(sample_color.rgb, input.tex_coord)), sample_color.a);
    }
    if a.detail.x > 0.0 || a.detail.y > 0.0 || abs(a.extra.z) > 0.0 {
        let radius = max(1.0, a.detail.x) / uniforms.resolution;
        var blurred = rgb * 4.0;
        blurred += textureSample(input_texture, input_sampler, input.tex_coord + vec2f(radius.x, 0.0)).rgb;
        blurred += textureSample(input_texture, input_sampler, input.tex_coord - vec2f(radius.x, 0.0)).rgb;
        blurred += textureSample(input_texture, input_sampler, input.tex_coord + vec2f(0.0, radius.y)).rgb;
        blurred += textureSample(input_texture, input_sampler, input.tex_coord - vec2f(0.0, radius.y)).rgb;
        blurred /= 8.0;
        let detail = rgb - blurred;
        let mid = 4.0 * clamp(luminance(rgb), 0.0, 1.0) * (1.0 - clamp(luminance(rgb), 0.0, 1.0));
        rgb = mix(rgb, blurred, min(a.detail.x, 1.0) * a.detail.z) + detail * (a.detail.y + a.extra.z * mid) * a.detail.z;
    }
    let temperature = uniforms.primary.w;
    let tint = uniforms.secondary.x;
    rgb *= exp2(vec3f(temperature * 0.25 + tint * 0.1, -tint * 0.2, -temperature * 0.25 + tint * 0.1));
    rgb *= exp2(uniforms.primary.x);

    let lift = (wheel(uniforms.lift.xy) + a.bars[0].rgb + uniforms.lift.z) * 0.2;
    let gamma = exp2((wheel(uniforms.gamma.xy) + a.bars[1].rgb) * 0.5 + uniforms.gamma.z);
    let gain = exp2((wheel(uniforms.gain.xy) + a.bars[2].rgb) * 0.5 + uniforms.gain.z);
    if a.log.x > 0.5 {
        let l = clamp(luminance(rgb), 0.0, 1.0);
        let shadow = 1.0 - smoothstep(0.0, a.log.y, l);
        let high = smoothstep(a.log.z, 1.0, l);
        rgb += lift * shadow + (gamma - 1.0) * 0.2 * (1.0 - shadow - high) + (gain - 1.0) * 0.2 * high;
    } else {
        rgb = max(rgb * gain + lift * (vec3f(1.0) - rgb), vec3f(0.0));
        rgb = pow(rgb, vec3f(1.0) / gamma);
    }
    rgb += (wheel(uniforms.offset.xy) + a.bars[3].rgb + uniforms.offset.z) * 0.25;

    let luma = dot(clamp(rgb, vec3f(0.0), vec3f(1.0)), vec3f(0.2126, 0.7152, 0.0722));
    rgb += uniforms.secondary.z * 0.25 * pow(1.0 - luma, 2.0);
    rgb += uniforms.secondary.w * 0.25 * pow(luma, 2.0);
    rgb = (rgb - uniforms.secondary.y) * uniforms.primary.y + uniforms.secondary.y;
    let gray = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
    rgb = mix(vec3f(gray), rgb, uniforms.primary.z);
    let pre_mix_luma = luminance(rgb);
    var m0 = a.mixer[0].rgb; var m1 = a.mixer[1].rgb; var m2 = a.mixer[2].rgb;
    if a.mixer[2].w > 0.5 {
        m0 /= max(abs(dot(m0, vec3f(1.0))), 0.001);
        m1 /= max(abs(dot(m1, vec3f(1.0))), 0.001);
        m2 /= max(abs(dot(m2, vec3f(1.0))), 0.001);
    }
    rgb = vec3f(dot(rgb, m0), dot(rgb, m1), dot(rgb, m2));
    if a.mixer[0].w > 0.5 { rgb = vec3f(luminance(rgb)); }
    if a.mixer[1].w > 0.5 { rgb += pre_mix_luma - luminance(rgb); }
    rgb = vec3f(curve(curve(rgb.r, 1u, 0u), 0u, 0u), curve(curve(rgb.g, 2u, 0u), 0u, 0u), curve(curve(rgb.b, 3u, 0u), 0u, 0u));
    var h = hsv(rgb);
    let original_hue = h.x; let original_sat = h.y;
    h.x = fract(h.x + a.extra.x + curve(original_hue, 0u, 1u) - 0.5 + 1.0);
    h.y *= (1.0 + a.extra.y * (1.0 - h.y)) * curve(original_hue, 1u, 1u) * 2.0 * curve(luminance(rgb), 3u, 1u) * 2.0 * curve(original_sat, 0u, 2u) * 2.0;
    h.z *= curve(original_hue, 2u, 1u) * 2.0 * curve(original_sat, 1u, 2u) * 2.0;
    rgb = from_hsv(vec3f(h.x, clamp(h.y, 0.0, 1.0), h.z));
    rgb += (luminance(sample_color.rgb) - luminance(rgb)) * a.extra.w;
    rgb = apply_lut(rgb);
    rgb = mix(sample_color.rgb, clamp(rgb, vec3f(0.0), vec3f(1.0)), matte(sample_color.rgb, input.tex_coord));
    return vec4f(rgb, sample_color.a);
}
