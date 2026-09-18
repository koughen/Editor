use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = audioReverbImpulse)]
pub fn audio_reverb_impulse(sample_rate: f64, decay: f64, channel: u32) -> Vec<f32> {
    audio::reverb_impulse(sample_rate, decay, channel)
}

#[wasm_bindgen(js_name = normalizeAudioMix)]
pub fn normalize_audio_mix(value: JsValue) -> Result<JsValue, JsValue> {
    let settings: audio::MixSettings =
        serde_wasm_bindgen::from_value(value).map_err(|e| JsValue::from_str(&e.to_string()))?;
    settings
        .normalized()
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen(js_name = audioMixPreset)]
pub fn audio_mix_preset(name: &str) -> Result<JsValue, JsValue> {
    audio::preset(name)
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen(js_name = audioFadeGain)]
pub fn audio_fade_gain(time: f64, duration: f64, fade_in: f64, fade_out: f64) -> f64 {
    audio::fade_gain(time, duration, fade_in, fade_out)
}

#[wasm_bindgen(js_name = audioChannelAudible)]
pub fn audio_channel_audible(muted: bool, solo: bool, any_solo: bool) -> bool {
    audio::channel_audible(muted, solo, any_solo)
}

#[wasm_bindgen(js_name = audioCurvedFade)]
pub fn audio_curved_fade(t: f64, d: f64, i: f64, o: f64, ci: &str, co: &str) -> f64 {
    audio::curved_fade(t, d, i, o, ci, co)
}
#[wasm_bindgen(js_name = audioCrossfadeOverlap)]
pub fn audio_crossfade_overlap(a: f64, ad: f64, b: f64, bd: f64) -> f64 {
    audio::crossfade_overlap(a, ad, b, bd)
}
#[wasm_bindgen(js_name = audioCleanupParameters)]
pub fn audio_cleanup_parameters(value: JsValue, bypass: bool) -> Result<Vec<f32>, JsValue> {
    let s: audio::CleanupSettings =
        serde_wasm_bindgen::from_value(value).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(s.normalized().packed(bypass))
}
#[wasm_bindgen(js_name = audioAutomationValue)]
pub fn audio_automation_value(points: JsValue, time: f64, fallback: f64) -> Result<f64, JsValue> {
    let p: Vec<audio::AutomationPoint> =
        serde_wasm_bindgen::from_value(points).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(audio::automation_value(&p, time, fallback))
}
#[wasm_bindgen(js_name = audioWavBytes)]
pub fn audio_wav_bytes(l: &[f32], r: &[f32], rate: u32, bits: u16) -> Result<Vec<u8>, JsValue> {
    audio::wav_bytes(l, r, rate, bits).map_err(|e| JsValue::from_str(&e))
}
#[wasm_bindgen]
pub struct AudioLoudness(audio::loudness::Loudness);
#[wasm_bindgen]
impl AudioLoudness {
    #[wasm_bindgen(constructor)]
    pub fn new(rate: u32) -> Result<AudioLoudness, JsValue> {
        if !(8000..=192000).contains(&rate) {
            return Err(JsValue::from_str("Unsupported meter sample rate"));
        }
        Ok(Self(audio::loudness::Loudness::new(rate)))
    }
    pub fn add(&mut self, l: &[f32], r: &[f32]) {
        self.0.add(l, r);
    }
    pub fn reading(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.0.reading())
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}
#[wasm_bindgen(js_name = audioRouting)]
pub fn audio_routing(channels: JsValue) -> Result<JsValue, JsValue> {
    let c: Vec<audio::RouteChannel> =
        serde_wasm_bindgen::from_value(channels).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&audio::routing(&c)).map_err(|e| JsValue::from_str(&e.to_string()))
}
#[wasm_bindgen(js_name = audioNormalizationGain)]
pub fn audio_normalization_gain(integrated: f64, true_peak: f64, target: f64, ceiling: f64) -> f64 {
    if !integrated.is_finite() || !true_peak.is_finite() {
        return 0.;
    }
    (target.clamp(-36., -5.) - integrated)
        .min(ceiling.clamp(-6., 0.) - true_peak)
        .clamp(-60., 24.)
}
