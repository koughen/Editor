//! Platform-independent mixer settings and envelope policy. The web shell owns
//! Web Audio nodes; every shell shares these defaults, limits and presets.
use serde::{Deserialize, Serialize};
pub mod advanced;
pub mod dynamics;
pub mod loudness;
pub use advanced::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MixSettings {
    pub cleanup: CleanupSettings,
    pub bands: Vec<EqBand>,
    pub effect_order: Vec<String>,
    pub automation: std::collections::BTreeMap<String, Vec<AutomationPoint>>,
    pub automation_enabled: bool,
    pub output_id: String,
    pub sends: Vec<Send>,
    pub duck_source: String,
    pub wet_only: bool,
    pub plugins: Vec<PluginInsert>,
    pub gain_db: f64,
    pub pan: f64,
    pub bypass: bool,
    pub eq_enabled: bool,
    pub high_pass: f64,
    pub low_gain: f64,
    pub low_mid_gain: f64,
    pub low_mid_freq: f64,
    pub high_mid_gain: f64,
    pub high_mid_freq: f64,
    pub high_gain: f64,
    pub compressor_enabled: bool,
    pub threshold: f64,
    pub ratio: f64,
    pub attack: f64,
    pub release: f64,
    pub makeup: f64,
    pub reverb_mix: f64,
    pub reverb_decay: f64,
    pub delay_mix: f64,
    pub delay_time: f64,
    pub delay_feedback: f64,
}

impl Default for MixSettings {
    fn default() -> Self {
        Self {
            cleanup: CleanupSettings::default(),
            bands: Vec::new(),
            effect_order: vec!["cleanup", "eq", "compressor", "reverb", "delay"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
            automation: Default::default(),
            automation_enabled: true,
            output_id: "master".into(),
            sends: Vec::new(),
            duck_source: String::new(),
            wet_only: false,
            plugins: Vec::new(),
            gain_db: 0.,
            pan: 0.,
            bypass: false,
            eq_enabled: true,
            high_pass: 20.,
            low_gain: 0.,
            low_mid_gain: 0.,
            low_mid_freq: 400.,
            high_mid_gain: 0.,
            high_mid_freq: 3000.,
            high_gain: 0.,
            compressor_enabled: false,
            threshold: -18.,
            ratio: 3.,
            attack: 10.,
            release: 150.,
            makeup: 0.,
            reverb_mix: 0.,
            reverb_decay: 1.5,
            delay_mix: 0.,
            delay_time: 250.,
            delay_feedback: 0.25,
        }
    }
}

fn finite(value: f64, fallback: f64, min: f64, max: f64) -> f64 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        fallback
    }
}

impl MixSettings {
    pub fn normalized(mut self) -> Self {
        let d = Self::default();
        macro_rules! limit {
            ($field:ident, $min:expr, $max:expr) => {
                self.$field = finite(self.$field, d.$field, $min, $max);
            };
        }
        limit!(gain_db, -60., 12.);
        limit!(pan, -1., 1.);
        limit!(high_pass, 20., 1000.);
        limit!(low_gain, -18., 18.);
        limit!(low_mid_gain, -18., 18.);
        limit!(high_mid_gain, -18., 18.);
        limit!(high_gain, -18., 18.);
        limit!(low_mid_freq, 80., 2000.);
        limit!(high_mid_freq, 500., 12000.);
        limit!(threshold, -60., 0.);
        limit!(ratio, 1., 20.);
        limit!(attack, 0.1, 200.);
        limit!(release, 10., 1000.);
        limit!(makeup, 0., 18.);
        limit!(reverb_mix, 0., 1.);
        limit!(reverb_decay, 0.2, 5.);
        limit!(delay_mix, 0., 1.);
        limit!(delay_time, 10., 1000.);
        limit!(delay_feedback, 0., 0.85);
        self.cleanup = self.cleanup.normalized();
        self.bands.truncate(8);
        self.bands = self
            .bands
            .into_iter()
            .enumerate()
            .map(|(i, b)| {
                let mut b = b.normalized();
                if b.id.is_empty() {
                    b.id = format!("band-{i}");
                }
                b
            })
            .collect();
        let valid = ["cleanup", "eq", "compressor", "reverb", "delay"];
        let mut order = Vec::new();
        for name in self.effect_order.iter().map(String::as_str).chain(valid) {
            if valid.contains(&name) && !order.iter().any(|s| s == name) {
                order.push(name.to_owned());
            }
        }
        self.effect_order = order;
        self.sends.truncate(16);
        for send in &mut self.sends {
            send.level_db = finite(send.level_db, -12., -60., 12.);
        }
        self.automation.retain(|key, points| {
            if parameter_range(key).is_none() {
                return false;
            }
            *points = normalize_points(key, points);
            !points.is_empty()
        });
        self.plugins.truncate(8);
        for (i, p) in self.plugins.iter_mut().enumerate() {
            if p.instance_id.is_empty() {
                p.instance_id = format!("insert-{i}");
            }
        }
        self
    }
}

pub fn preset(name: &str) -> MixSettings {
    let mut s = MixSettings::default();
    match name {
        "voice" => {
            s.high_pass = 85.;
            s.low_mid_gain = -3.;
            s.high_mid_gain = 2.5;
            s.compressor_enabled = true;
            s.threshold = -20.;
            s.makeup = 2.;
        }
        "warm" => {
            s.low_gain = 3.;
            s.high_gain = -2.;
            s.reverb_mix = 0.12;
        }
        "punch" => {
            s.low_gain = 2.;
            s.high_mid_gain = 2.;
            s.compressor_enabled = true;
            s.ratio = 4.;
            s.attack = 25.;
            s.release = 80.;
        }
        "space" => {
            s.reverb_mix = 0.3;
            s.reverb_decay = 3.;
            s.delay_mix = 0.12;
            s.delay_time = 375.;
        }
        _ => {}
    }
    s
}

/// Overlapping fades multiply. Durations are clamped after trims or retiming.
pub fn fade_gain(time: f64, duration: f64, fade_in: f64, fade_out: f64) -> f64 {
    if !time.is_finite() || !duration.is_finite() || duration <= 0. || time < 0. || time > duration
    {
        return 0.;
    }
    let i = finite(fade_in, 0., 0., duration);
    let o = finite(fade_out, 0., 0., duration);
    let attack = if i > 0. { (time / i).min(1.) } else { 1. };
    let release = if o > 0. {
        ((duration - time) / o).min(1.)
    } else {
        1.
    };
    attack * release
}

pub fn channel_audible(muted: bool, solo: bool, any_solo: bool) -> bool {
    !muted && (!any_solo || solo)
}

pub fn reverb_impulse(sample_rate: f64, decay: f64, channel: u32) -> Vec<f32> {
    let rate = finite(sample_rate, 48000., 8000., 192000.);
    let seconds = finite(decay, 1.5, 0.2, 5.);
    let length = (rate * seconds).ceil() as usize;
    let mut seed = 0x10203040_u32.wrapping_add(channel);
    (0..length)
        .map(|i| {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            ((seed as f64 / 2147483648. - 1.) * (1. - i as f64 / length as f64).powi(3)) as f32
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reverb_is_repeatable_stereo_and_decays() {
        let left = reverb_impulse(48000., 1., 0);
        assert_eq!(left, reverb_impulse(48000., 1., 0));
        assert_ne!(left, reverb_impulse(48000., 1., 1));
        assert_eq!(left.len(), 48000);
        assert!(left[left.len() - 1].abs() < 0.000001);
    }
    #[test]
    fn defaults_are_neutral() {
        let s = MixSettings::default().normalized();
        assert_eq!(s.gain_db, 0.);
        assert_eq!(s.pan, 0.);
        assert_eq!(s.reverb_mix, 0.);
        assert!(!s.compressor_enabled);
    }
    #[test]
    fn limits_reject_nonfinite_and_feedback_runaway() {
        let s = MixSettings {
            gain_db: f64::NAN,
            pan: 99.,
            delay_feedback: 1.,
            ..Default::default()
        }
        .normalized();
        assert_eq!(s.gain_db, 0.);
        assert_eq!(s.pan, 1.);
        assert_eq!(s.delay_feedback, 0.85);
    }
    #[test]
    fn fade_boundaries_and_overlap() {
        assert_eq!(fade_gain(0., 4., 1., 1.), 0.);
        assert_eq!(fade_gain(0.5, 4., 1., 1.), 0.5);
        assert_eq!(fade_gain(2., 4., 1., 1.), 1.);
        assert_eq!(fade_gain(4., 4., 1., 1.), 0.);
        assert_eq!(fade_gain(1., 2., 10., 10.), 0.25);
        assert_eq!(fade_gain(0., 0., 0., 0.), 0.);
    }
    #[test]
    fn solo_respects_mute_and_multiple_solos() {
        assert!(channel_audible(false, false, false));
        assert!(!channel_audible(false, false, true));
        assert!(channel_audible(false, true, true));
        assert!(!channel_audible(true, true, true));
    }
}
