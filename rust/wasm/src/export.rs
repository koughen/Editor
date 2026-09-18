use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = resolveExportSettings)]
pub fn resolve_export_settings(input: &str) -> Result<String, JsValue> {
    editor_export::resolve_settings_json(input).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen(js_name = buildProjectHandoff)]
pub fn build_project_handoff(input: &str) -> Result<String, JsValue> {
    editor_export::build_handoff_json(input).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen(js_name = safeExportFileName)]
pub fn safe_export_file_name(name: &str) -> String {
    editor_export::safe_name(name)
}
