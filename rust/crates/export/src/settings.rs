use crate::TICKS;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Rate {
    pub numerator: u32,
    pub denominator: u32,
}
impl Rate {
    pub fn value(self) -> f64 {
        self.numerator as f64 / self.denominator as f64
    }
    pub fn frames(self, ticks: f64) -> i64 {
        (ticks / TICKS * self.value()).round() as i64
    }
    pub fn validate(self) -> Result<Self, String> {
        if self.denominator == 0 || !(1.0..=120.0).contains(&self.value()) {
            return Err("Frame rate must be between 1 and 120 fps.".into());
        }
        Ok(self)
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub format: String,
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub fps: Rate,
    pub video_bitrate: u32,
    pub bitrate_mode: String,
    pub key_frame_interval: f64,
    pub hardware_acceleration: String,
    pub include_audio: bool,
    pub audio_codec: String,
    pub audio_bitrate: u32,
    pub audio_sample_rate: u32,
    pub audio_channels: u32,
    pub start_ticks: f64,
    pub end_ticks: f64,
    pub frame_count: u64,
    pub fit: String,
    pub estimated_bytes: u64,
}
fn number(v: &Value, key: &str, default: f64) -> Result<f64, String> {
    if v.get(key).is_none() {
        return Ok(default);
    }
    v[key]
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or_else(|| format!("Enter a valid {key}."))
}
fn choice(v: &Value, key: &str, default: &str, allowed: &[&str]) -> Result<String, String> {
    let s = v.get(key).and_then(Value::as_str).unwrap_or(default);
    if !allowed.contains(&s) {
        return Err(format!("Unsupported {key}: {s}"));
    }
    Ok(s.into())
}
fn integer(v: &Value, key: &str, default: f64, min: f64, max: f64) -> Result<u32, String> {
    let n = number(v, key, default)?;
    if n.fract() != 0.0 || !(min..=max).contains(&n) {
        return Err(format!(
            "{key} must be a whole number between {min} and {max}."
        ));
    }
    Ok(n as u32)
}
pub fn resolve_settings_json(input: &str) -> Result<String, String> {
    let v: Value = serde_json::from_str(input).map_err(|e| e.to_string())?;
    serde_json::to_string(&resolve_settings(&v)?).map_err(|e| e.to_string())
}
pub fn resolve_settings(v: &Value) -> Result<Settings, String> {
    let o = &v["options"];
    let project = &v["projectSettings"];
    let duration = number(v, "duration", 0.0)?;
    if duration <= 0.0 {
        return Err("Add a clip to the timeline before exporting.".into());
    }
    let width = integer(
        o,
        "width",
        project["canvasSize"]["width"].as_f64().unwrap_or(1920.0),
        16.0,
        7680.0,
    )?;
    let height = integer(
        o,
        "height",
        project["canvasSize"]["height"].as_f64().unwrap_or(1080.0),
        16.0,
        7680.0,
    )?;
    if width % 2 != 0 || height % 2 != 0 {
        return Err("Video width and height must be even numbers.".into());
    }
    let fps: Rate = serde_json::from_value(o.get("fps").unwrap_or(&project["fps"]).clone())
        .map_err(|_| "Choose a valid frame rate.")?;
    let fps = fps.validate()?;
    let format = choice(o, "format", "mp4", &["mp4", "webm"])?;
    let codec = choice(
        o,
        "codec",
        if format == "mp4" { "avc" } else { "vp9" },
        &["avc", "hevc", "vp9", "av1"],
    )?;
    if (format == "mp4" && codec == "vp9")
        || (format == "webm" && (codec == "avc" || codec == "hevc"))
    {
        return Err("This codec is not available in the selected container.".into());
    }
    let quality = choice(
        o,
        "quality",
        "high",
        &["low", "medium", "high", "very_high"],
    )?;
    let factor = match quality.as_str() {
        "low" => 0.04,
        "medium" => 0.08,
        "very_high" => 0.24,
        _ => 0.14,
    };
    let default_bitrate = ((width as f64 * height as f64 * fps.value() * factor).round())
        .clamp(500_000.0, 200_000_000.0);
    let video_bitrate = integer(o, "videoBitrate", default_bitrate, 100_000.0, 500_000_000.0)?;
    let key_frame_interval = number(o, "keyFrameInterval", 2.0)?;
    if !(0.1..=30.0).contains(&key_frame_interval) {
        return Err("Keyframe interval must be between 0.1 and 30 seconds.".into());
    }
    let start_ticks = number(o, "rangeStart", 0.0)?;
    let end_ticks = number(o, "rangeEnd", duration)?;
    if start_ticks < 0.0 || end_ticks > duration || end_ticks <= start_ticks {
        return Err(
            "Choose an export range within the timeline, with the end after the start.".into(),
        );
    }
    let frame_count = (((end_ticks - start_ticks) / TICKS * fps.value()) - 1e-9)
        .ceil()
        .max(1.0) as u64;
    let audio_sample_rate = integer(o, "audioSampleRate", 48000.0, 44100.0, 48000.0)?;
    if ![44100, 48000].contains(&audio_sample_rate) {
        return Err("Choose 44.1 kHz or 48 kHz audio.".into());
    }
    let include_audio = o["includeAudio"].as_bool().unwrap_or(true);
    let audio_bitrate = integer(o, "audioBitrate", 192000.0, 64000.0, 320000.0)?;
    let estimated_bytes = ((end_ticks - start_ticks) / TICKS
        * (video_bitrate + if include_audio { audio_bitrate } else { 0 }) as f64
        / 8.0) as u64;
    Ok(Settings {
        format: format.clone(),
        codec,
        width,
        height,
        fps,
        video_bitrate,
        bitrate_mode: choice(o, "bitrateMode", "variable", &["constant", "variable"])?,
        key_frame_interval,
        hardware_acceleration: choice(
            o,
            "hardwareAcceleration",
            "no-preference",
            &["no-preference", "prefer-hardware", "prefer-software"],
        )?,
        include_audio,
        audio_codec: if format == "mp4" { "aac" } else { "opus" }.into(),
        audio_bitrate,
        audio_sample_rate,
        audio_channels: integer(o, "audioChannels", 2.0, 1.0, 2.0)?,
        start_ticks,
        end_ticks,
        frame_count,
        fit: choice(o, "fit", "contain", &["contain", "cover", "stretch"])?,
        estimated_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn request() -> Value {
        json!({"options":{}, "projectSettings":{"canvasSize":{"width":1920,"height":1080},"fps":{"numerator":30000,"denominator":1001}}, "duration":120000})
    }
    #[test]
    fn fractional_frame_and_tail_are_preserved() {
        let s = resolve_settings(&request()).unwrap();
        assert_eq!(s.frame_count, 30);
        assert_eq!(s.fps.numerator, 30000);
    }
    #[test]
    fn range_resolution_codec_validation() {
        for options in [
            json!({"width":1919}),
            json!({"rangeStart":120000}),
            json!({"rangeEnd":120001}),
            json!({"format":"webm","codec":"avc"}),
            json!({"videoBitrate":0}),
            json!({"fps":{"numerator":30,"denominator":0}}),
        ] {
            let mut r = request();
            r["options"] = options;
            assert!(resolve_settings(&r).is_err());
        }
    }
    #[test]
    fn explicit_settings_reach_encoder_plan() {
        let mut r = request();
        r["options"] = json!({"format":"webm","codec":"av1","videoBitrate":12000000,"rangeStart":60000,"audioChannels":1,"audioSampleRate":44100,"keyFrameInterval":1});
        let s = resolve_settings(&r).unwrap();
        assert_eq!(s.frame_count, 15);
        assert_eq!(s.audio_codec, "opus");
        assert_eq!(s.video_bitrate, 12000000);
        assert_eq!(s.start_ticks, 60000.0);
    }
}
