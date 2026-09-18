#![cfg(target_arch = "wasm32")]

use effects::{ApplyEffectsOptions, EffectPass, UniformValue};
use gpu::wgpu;
use js_sys::Object;
use serde::Deserialize;
use wasm_bindgen::{JsCast, JsValue, prelude::wasm_bindgen};

use crate::gpu::{
    import_canvas_texture, read_offscreen_canvas_property, read_serde_property, read_u32_property,
    render_texture_to_canvas, with_gpu_runtime,
};

struct ApplyEffectPassesOptions {
    source: wgpu::web_sys::OffscreenCanvas,
    width: u32,
    height: u32,
    passes: Vec<EffectPassInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EffectPassInput {
    shader: String,
    uniforms: Vec<EffectUniformInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EffectUniformInput {
    name: String,
    value: Vec<f32>,
}

#[wasm_bindgen(js_name = applyEffectPasses)]
pub fn apply_effect_passes(options: JsValue) -> Result<wgpu::web_sys::OffscreenCanvas, JsValue> {
    let ApplyEffectPassesOptions {
        source,
        width,
        height,
        passes,
    } = parse_apply_effect_passes_options(options)?;

    with_gpu_runtime(|runtime| {
        let source_texture = import_canvas_texture(
            &runtime.context,
            &source,
            width,
            height,
            "effects-input-texture",
        );
        let effect_passes = map_effect_passes(passes);
        let result_texture = runtime
            .effects
            .apply(
                &runtime.context,
                ApplyEffectsOptions {
                    source: &source_texture,
                    width,
                    height,
                    passes: &effect_passes,
                },
            )
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        render_texture_to_canvas(&runtime.context, &result_texture, width, height)
    })
}

fn map_effect_passes(effect_passes: Vec<EffectPassInput>) -> Vec<EffectPass> {
    effect_passes
        .into_iter()
        .map(|pass| EffectPass {
            shader: pass.shader,
            uniforms: pass
                .uniforms
                .into_iter()
                .map(|uniform| {
                    let value = if uniform.value.len() == 1 {
                        UniformValue::Number(uniform.value[0])
                    } else {
                        UniformValue::Vector(uniform.value)
                    };
                    (uniform.name, value)
                })
                .collect(),
        })
        .collect()
}

fn parse_apply_effect_passes_options(value: JsValue) -> Result<ApplyEffectPassesOptions, JsValue> {
    let object: Object = value
        .dyn_into()
        .map_err(|_| JsValue::from_str("applyEffectPasses expects an options object"))?;

    Ok(ApplyEffectPassesOptions {
        source: read_offscreen_canvas_property(&object, "source")?,
        width: read_u32_property(&object, "width")?,
        height: read_u32_property(&object, "height")?,
        passes: read_serde_property(&object, "passes")?,
    })
}

#[derive(Deserialize)]
struct ColorScopeOptions {
    rgba: Vec<u8>,
    width: usize,
    #[serde(default)]
    parade: bool,
    #[serde(default)]
    mode: Option<String>,
}

#[wasm_bindgen(js_name = buildColorScope)]
pub fn build_color_scope(options: JsValue) -> Result<Vec<u8>, JsValue> {
    let options: ColorScopeOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(effects::color_scope_mode(
        &options.rgba,
        options.width,
        options
            .mode
            .as_deref()
            .unwrap_or(if options.parade { "parade" } else { "waveform" }),
    ))
}

#[derive(Deserialize)]
struct ParseCubeOptions {
    text: String,
}

#[derive(Deserialize)]
struct ColorSampleOptions {
    rgb: [u8; 3],
}
#[wasm_bindgen(js_name = sampleColor)]
pub fn sample_color(options: JsValue) -> Result<Vec<f32>, JsValue> {
    let options: ColorSampleOptions =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(effects::sample_color(options.rgb).to_vec())
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CubeResult {
    size: u32,
    domain_min: [f32; 3],
    domain_max: [f32; 3],
    values: Vec<f32>,
}
#[wasm_bindgen(js_name = parseCubeLut)]
pub fn parse_cube_lut(options: JsValue) -> Result<JsValue, JsValue> {
    let options: ParseCubeOptions =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let lut = effects::parse_cube(&options.text).map_err(|e| JsValue::from_str(&e))?;
    serde_wasm_bindgen::to_value(&CubeResult {
        size: lut.size,
        domain_min: lut.domain_min,
        domain_max: lut.domain_max,
        values: lut.values,
    })
    .map_err(|e| JsValue::from_str(&e.to_string()))
}
