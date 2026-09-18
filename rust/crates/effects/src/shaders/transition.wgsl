struct VertexOutput { @builtin(position) position: vec4f, @location(0) tex_coord: vec2f }
struct Uniforms { resolution: vec2f, timing: vec2f, controls: vec4f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;
@group(1) @binding(0) var<uniform> u: Uniforms;
fn transition(color: vec4f, mode: f32, progress: f32, uv: vec2f) -> vec4f {
    let t = clamp(progress,0.0,1.0); var result = color;
    if mode < 0.5 || t >= 1.0 { return color; }
    if mode < 1.5 { result.a *= t; }
    else if mode < 2.5 { result = vec4f(color.rgb*t,color.a); }
    else if mode < 3.5 { result = vec4f(mix(vec3f(1.0),color.rgb,t),color.a); }
    else if mode < 4.5 { result.a *= 1.0-smoothstep(t-0.005,t+0.005,uv.x); }
    else if mode < 5.5 { result.a *= 1.0-smoothstep(t-0.005,t+0.005,1.0-uv.x); }
    else if mode < 6.5 { result.a *= 1.0-smoothstep(t*0.72-0.005,t*0.72+0.005,length(uv-0.5)); }
    else { result.a *= t; }
    if t <= 0.0 && (mode < 1.5 || mode > 3.5) { result.a = 0.0; }
    return result;
}
@fragment fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let time = u.timing.x; let duration = u.timing.y;
    let tin = min(u.controls.y,duration*0.5); let tout = min(u.controls.w,duration*0.5);
    let pin = select(1.0,clamp(time/max(tin,0.0001),0.0,1.0),tin>0.0);
    let pout = select(1.0,clamp((duration-time)/max(tout,0.0001),0.0,1.0),tout>0.0);
    var scale = 1.0;
    if u.controls.x > 6.5 { scale *= 0.75+0.25*pin; }
    if u.controls.z > 6.5 { scale *= 0.75+0.25*pout; }
    let uv = (input.tex_coord-0.5)*scale+0.5;
    let color = textureSample(source,source_sampler,uv);
    return transition(transition(color,u.controls.x,pin,input.tex_coord),u.controls.z,pout,input.tex_coord);
}
