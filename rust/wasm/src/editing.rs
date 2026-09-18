use wasm_bindgen::prelude::*;
use serde::Deserialize;
#[derive(Deserialize)] struct ExportOptions { cues: Vec<editing::Cue>, format: String }
#[wasm_bindgen(js_name = exportSubtitles)] pub fn export_subtitles(value: JsValue) -> Result<String,JsValue> { let options: ExportOptions = serde_wasm_bindgen::from_value(value).map_err(|e| JsValue::from_str(&e.to_string()))?; Ok(editing::export_subtitles(&options.cues, options.format == "vtt")) }
#[derive(Deserialize)] struct VttOptions { text: String }
#[wasm_bindgen(js_name = parseVttSubtitles)] pub fn parse_vtt_subtitles(value: JsValue) -> Result<JsValue,JsValue> { let options: VttOptions = serde_wasm_bindgen::from_value(value).map_err(|e| JsValue::from_str(&e.to_string()))?; serde_wasm_bindgen::to_value(&editing::parse_vtt(&options.text)).map_err(|e| JsValue::from_str(&e.to_string())) }
#[derive(Deserialize)] struct SplitOptions { cue: editing::Cue, at: f64 }
#[wasm_bindgen(js_name = splitCaptionCue)] pub fn split_caption_cue(value: JsValue) -> Result<JsValue,JsValue> { let options: SplitOptions = serde_wasm_bindgen::from_value(value).map_err(|e| JsValue::from_str(&e.to_string()))?; let cues = editing::split_cue(&options.cue, options.at).ok_or_else(|| JsValue::from_str("Place the playhead inside a caption with at least two words"))?; serde_wasm_bindgen::to_value(&cues).map_err(|e| JsValue::from_str(&e.to_string())) }
#[derive(Deserialize)] struct TailOptions { clips: Vec<editing::TransitionClip> }
#[wasm_bindgen(js_name = transitionTails)] pub fn transition_tails(value: JsValue) -> Result<Vec<f64>,JsValue> { let options: TailOptions = serde_wasm_bindgen::from_value(value).map_err(|e| JsValue::from_str(&e.to_string()))?; Ok(editing::transition_tails(&options.clips)) }

#[derive(Deserialize)] struct MergeOptions { first: editing::Cue, second: editing::Cue }
#[wasm_bindgen(js_name = mergeCaptionCues)] pub fn merge_caption_cues(value: JsValue) -> Result<JsValue,JsValue> { let options: MergeOptions = serde_wasm_bindgen::from_value(value).map_err(|e| JsValue::from_str(&e.to_string()))?; let cue = editing::merge_cues(&options.first, &options.second).ok_or_else(|| JsValue::from_str("Invalid caption timing"))?; serde_wasm_bindgen::to_value(&cue).map_err(|e| JsValue::from_str(&e.to_string())) }
