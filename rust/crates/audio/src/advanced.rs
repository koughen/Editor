use crate::finite;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CleanupSettings {
    pub noise_enabled: bool,
    pub noise_floor: f64,
    pub noise_reduction: f64,
    pub gate_enabled: bool,
    pub gate_threshold: f64,
    pub gate_ratio: f64,
    pub gate_attack: f64,
    pub gate_release: f64,
    pub deess_enabled: bool,
    pub deess_frequency: f64,
    pub deess_threshold: f64,
    pub deess_amount: f64,
    pub duck_enabled: bool,
    pub duck_threshold: f64,
    pub duck_amount: f64,
    pub duck_attack: f64,
    pub duck_release: f64,
}
impl Default for CleanupSettings {
    fn default() -> Self {
        Self {
            noise_enabled: false,
            noise_floor: -48.,
            noise_reduction: 12.,
            gate_enabled: false,
            gate_threshold: -42.,
            gate_ratio: 4.,
            gate_attack: 5.,
            gate_release: 150.,
            deess_enabled: false,
            deess_frequency: 5500.,
            deess_threshold: -30.,
            deess_amount: 6.,
            duck_enabled: false,
            duck_threshold: -35.,
            duck_amount: 12.,
            duck_attack: 25.,
            duck_release: 350.,
        }
    }
}
impl CleanupSettings {
    pub fn normalized(mut self) -> Self {
        let d = Self::default();
        macro_rules! limit {
            ($f:ident,$a:expr,$b:expr) => {
                self.$f = finite(self.$f, d.$f, $a, $b);
            };
        }
        limit!(noise_floor, -80., -20.);
        limit!(noise_reduction, 0., 30.);
        limit!(gate_threshold, -80., 0.);
        limit!(gate_ratio, 1., 20.);
        limit!(gate_attack, 0.1, 100.);
        limit!(gate_release, 10., 2000.);
        limit!(deess_frequency, 2000., 12000.);
        limit!(deess_threshold, -60., 0.);
        limit!(deess_amount, 0., 18.);
        limit!(duck_threshold, -60., 0.);
        limit!(duck_amount, 0., 36.);
        limit!(duck_attack, 1., 500.);
        limit!(duck_release, 20., 3000.);
        self
    }
    pub fn packed(&self, bypass: bool) -> Vec<f32> {
        vec![
            (self.noise_enabled && !bypass) as u8 as f32,
            self.noise_floor as f32,
            self.noise_reduction as f32,
            (self.gate_enabled && !bypass) as u8 as f32,
            self.gate_threshold as f32,
            self.gate_ratio as f32,
            self.gate_attack as f32,
            self.gate_release as f32,
            (self.deess_enabled && !bypass) as u8 as f32,
            self.deess_frequency as f32,
            self.deess_threshold as f32,
            self.deess_amount as f32,
            (self.duck_enabled && !bypass) as u8 as f32,
            self.duck_threshold as f32,
            self.duck_amount as f32,
            self.duck_attack as f32,
            self.duck_release as f32,
        ]
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct EqBand {
    pub id: String,
    pub kind: String,
    pub frequency: f64,
    pub gain: f64,
    pub q: f64,
    pub enabled: bool,
}
impl Default for EqBand {
    fn default() -> Self {
        Self {
            id: String::new(),
            kind: "peaking".into(),
            frequency: 1000.,
            gain: 0.,
            q: 1.,
            enabled: true,
        }
    }
}
impl EqBand {
    pub fn normalized(mut self) -> Self {
        if ![
            "peaking",
            "lowshelf",
            "highshelf",
            "highpass",
            "lowpass",
            "notch",
        ]
        .contains(&self.kind.as_str())
        {
            self.kind = "peaking".into();
        }
        self.frequency = finite(self.frequency, 1000., 20., 20000.);
        self.gain = finite(self.gain, 0., -24., 24.);
        self.q = finite(self.q, 1., 0.1, 18.);
        self
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Send {
    pub bus_id: String,
    pub level_db: f64,
    #[serde(default)]
    pub pre_fader: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInsert {
    #[serde(default)]
    pub instance_id: String,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub parameters: std::collections::BTreeMap<String, f64>,
    #[serde(default)]
    pub bypass: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationPoint {
    #[serde(default)]
    pub id: String,
    pub time: f64,
    pub value: f64,
    #[serde(default)]
    pub hold: bool,
}
pub fn parameter_range(key: &str) -> Option<(f64, f64)> {
    Some(match key {
        "gainDb" => (-60., 12.),
        "pan" => (-1., 1.),
        "highPass" => (20., 1000.),
        "lowGain" | "lowMidGain" | "highMidGain" | "highGain" => (-18., 18.),
        "lowMidFreq" => (80., 2000.),
        "highMidFreq" => (500., 12000.),
        "threshold" => (-60., 0.),
        "ratio" => (1., 20.),
        "attack" => (0.1, 200.),
        "release" => (10., 1000.),
        "makeup" => (0., 18.),
        "reverbMix" | "delayMix" => (0., 1.),
        "delayTime" => (10., 1000.),
        "delayFeedback" => (0., 0.85),
        k if k.starts_with("band:") => {
            let parts: Vec<_> = k.split(':').collect();
            if parts.len() != 3 || parts[1].parse::<usize>().ok().filter(|i| *i < 8).is_none() {
                return None;
            }
            match parts[2] {
                "frequency" => (20., 20000.),
                "gain" => (-24., 24.),
                "q" => (0.1, 18.),
                _ => return None,
            }
        }
        _ => return None,
    })
}
pub fn normalize_points(key: &str, points: &[AutomationPoint]) -> Vec<AutomationPoint> {
    let Some((min, max)) = parameter_range(key) else {
        return Vec::new();
    };
    let mut out: Vec<_> = points
        .iter()
        .filter(|p| p.time.is_finite() && p.time >= 0. && p.value.is_finite())
        .take(10000)
        .cloned()
        .collect();
    for (i, p) in out.iter_mut().enumerate() {
        if p.id.is_empty() {
            p.id = format!("point-{i}");
        }
    }
    out.sort_by(|a, b| a.time.total_cmp(&b.time));
    for p in &mut out {
        p.value = p.value.clamp(min, max);
    }
    out.dedup_by(|a, b| {
        if a.time == b.time {
            b.value = a.value;
            b.hold = a.hold;
            true
        } else {
            false
        }
    });
    out
}
pub fn automation_value(points: &[AutomationPoint], time: f64, fallback: f64) -> f64 {
    let Some(first) = points.first() else {
        return fallback;
    };
    if time <= first.time {
        return first.value;
    }
    for w in points.windows(2) {
        let (a, b) = (&w[0], &w[1]);
        if time < b.time {
            return if a.hold {
                a.value
            } else {
                a.value + (b.value - a.value) * (time - a.time) / (b.time - a.time)
            };
        }
    }
    points.last().unwrap().value
}
pub fn curved_fade(
    time: f64,
    duration: f64,
    fade_in: f64,
    fade_out: f64,
    curve_in: &str,
    curve_out: &str,
) -> f64 {
    if !time.is_finite() || !duration.is_finite() || duration <= 0. || time < 0. || time > duration
    {
        return 0.;
    }
    fn shape(x: f64, c: &str) -> f64 {
        match c {
            "equalPower" => (x * std::f64::consts::FRAC_PI_2).sin(),
            "sCurve" => x * x * (3. - 2. * x),
            _ => x,
        }
    }
    let i = finite(fade_in, 0., 0., duration);
    let o = finite(fade_out, 0., 0., duration);
    shape(if i > 0. { (time / i).min(1.) } else { 1. }, curve_in)
        * shape(
            if o > 0. {
                ((duration - time) / o).min(1.)
            } else {
                1.
            },
            curve_out,
        )
}
/// Crossfade existing overlap without moving picture or changing sync.
pub fn crossfade_overlap(a_start: f64, a_duration: f64, b_start: f64, b_duration: f64) -> f64 {
    if [a_start, a_duration, b_start, b_duration]
        .iter()
        .any(|v| !v.is_finite())
        || b_start < a_start
        || b_start + b_duration < a_start + a_duration
    {
        return 0.;
    }
    ((a_start + a_duration).min(b_start + b_duration) - b_start)
        .max(0.)
        .min(a_duration)
        .min(b_duration)
}
/// WAV samples are encoded in Rust so all shells use the same clipping/bit depth policy.
pub fn wav_bytes(
    left: &[f32],
    right: &[f32],
    sample_rate: u32,
    bits: u16,
) -> Result<Vec<u8>, String> {
    if left.len() != right.len()
        || ![16, 24, 32].contains(&bits)
        || !(8000..=192000).contains(&sample_rate)
    {
        return Err("Invalid WAV format".into());
    }
    let bytes = (bits / 8) as usize;
    let size = left
        .len()
        .checked_mul(2 * bytes)
        .filter(|s| *s < u32::MAX as usize - 36)
        .ok_or("WAV exceeds 4 GB; export a shorter range")?;
    let mut out = Vec::with_capacity(size + 44);
    out.extend(b"RIFF");
    out.extend(&(size as u32 + 36).to_le_bytes());
    out.extend(b"WAVEfmt ");
    out.extend(&16u32.to_le_bytes());
    out.extend(&(if bits == 32 { 3u16 } else { 1u16 }).to_le_bytes());
    out.extend(&2u16.to_le_bytes());
    out.extend(&sample_rate.to_le_bytes());
    out.extend(&(sample_rate * 2 * bytes as u32).to_le_bytes());
    out.extend(&(2 * bytes as u16).to_le_bytes());
    out.extend(&bits.to_le_bytes());
    out.extend(b"data");
    out.extend(&(size as u32).to_le_bytes());
    for (&l, &r) in left.iter().zip(right) {
        for v in [l, r] {
            let v = if v.is_finite() { v } else { 0. };
            match bits {
                32 => out.extend(&v.to_le_bytes()),
                16 => out.extend(
                    &((v.clamp(-1., 1.) as f64 * 32768.)
                        .round()
                        .clamp(-32768., 32767.) as i16)
                        .to_le_bytes(),
                ),
                _ => out.extend(
                    &((v.clamp(-1., 1.) as f64 * 8388608.)
                        .round()
                        .clamp(-8388608., 8388607.) as i32)
                        .to_le_bytes()[..3],
                ),
            }
        }
    }
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn curves_and_crossfades() {
        let a = curved_fade(0.5, 2., 1., 0., "equalPower", "linear");
        let b = curved_fade(1.5, 2., 0., 1., "linear", "equalPower");
        assert!((a * a + b * b - 1.).abs() < 1e-9);
        assert_eq!(crossfade_overlap(0., 2., 1.5, 3.), 0.5);
        assert_eq!(crossfade_overlap(0., 2., 3., 1.), 0.);
    }
    #[test]
    fn automation_sorts_and_clamps() {
        let p = normalize_points(
            "pan",
            &[
                AutomationPoint {
                    id: String::new(),
                    time: 2.,
                    value: 4.,
                    hold: false,
                },
                AutomationPoint {
                    id: String::new(),
                    time: 0.,
                    value: -1.,
                    hold: false,
                },
            ],
        );
        assert_eq!(automation_value(&p, 1., 0.), 0.);
        assert_eq!(automation_value(&p, 4., 0.), 1.);
    }
    #[test]
    fn wav_header_and_clipping() {
        let w = wav_bytes(&[-2., 1.], &[0., f32::NAN], 48000, 24).unwrap();
        assert_eq!(&w[0..4], b"RIFF");
        assert_eq!(w.len(), 56);
        assert_eq!(&w[44..47], &[0, 0, 128]);
        assert_eq!(&w[50..53], &[255, 255, 127]);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteChannel {
    pub id: String,
    pub kind: String,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub solo: bool,
    #[serde(default)]
    pub settings: crate::MixSettings,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelRoute {
    pub id: String,
    pub audible: bool,
    pub output_audible: bool,
    pub output_id: String,
    pub sends: Vec<Send>,
    pub duck_source: String,
}
/// Groups feed master, returns feed master. Sends target returns only, making cycles impossible.
pub fn routing(channels: &[RouteChannel]) -> Vec<ChannelRoute> {
    let any_solo = channels.iter().any(|c| c.solo);
    let dry_solo = channels.iter().any(|c| c.solo && c.kind != "return");
    let sends_to_solo = |c: &RouteChannel| {
        c.settings.sends.iter().any(|s| {
            channels
                .iter()
                .any(|r| r.kind == "return" && r.solo && r.id == s.bus_id)
        })
    };
    channels
        .iter()
        .map(|c| {
            let group = channels
                .iter()
                .find(|b| b.kind == "group" && b.id == c.settings.output_id);
            let output = if c.kind == "track" {
                group.map(|g| g.id.clone()).unwrap_or("master".into())
            } else {
                "master".into()
            };
            let selected = c.solo
                || group.is_some_and(|g| g.solo)
                || (c.kind == "group"
                    && channels
                        .iter()
                        .any(|t| t.solo && t.settings.output_id == c.id))
                || (c.kind == "return" && dry_solo);
            let group_wet = group.is_some_and(sends_to_solo);
            let audible = !c.muted
                && !group.is_some_and(|g| g.muted)
                && (!any_solo || selected || sends_to_solo(c) || group_wet);
            let output_audible = !any_solo || selected || (c.kind == "track" && group_wet);
            let sends = if c.kind == "return" {
                vec![]
            } else {
                c.settings
                    .sends
                    .iter()
                    .filter(|s| {
                        channels.iter().any(|b| {
                            b.kind == "return"
                                && b.id == s.bus_id
                                && (!any_solo || selected || b.solo)
                        })
                    })
                    .cloned()
                    .collect()
            };
            let duck_source = channels
                .iter()
                .find(|s| {
                    s.kind == "track" && s.id == c.settings.duck_source && s.id != c.id && !s.muted
                })
                .map(|s| s.id.clone())
                .unwrap_or_default();
            ChannelRoute {
                id: c.id.clone(),
                audible,
                output_audible,
                output_id: output,
                sends,
                duck_source,
            }
        })
        .collect()
}

#[cfg(test)]
mod routing_tests {
    use super::*;
    fn channel(id: &str, kind: &str) -> RouteChannel {
        RouteChannel {
            id: id.into(),
            kind: kind.into(),
            muted: false,
            solo: false,
            settings: Default::default(),
        }
    }
    #[test]
    fn group_solo_includes_children_and_rejects_cycles() {
        let mut track = channel("t", "track");
        track.settings.output_id = "g".into();
        track.settings.sends = vec![
            Send {
                bus_id: "t".into(),
                level_db: 0.,
                pre_fader: false,
            },
            Send {
                bus_id: "r".into(),
                level_db: -6.,
                pre_fader: false,
            },
        ];
        let mut group = channel("g", "group");
        group.solo = true;
        group.settings.output_id = "t".into();
        let result = routing(&[
            track,
            channel("other", "track"),
            group,
            channel("r", "return"),
        ]);
        assert!(result[0].audible);
        assert!(!result[1].audible);
        assert_eq!(result[0].output_id, "g");
        assert_eq!(result[2].output_id, "master");
        assert_eq!(result[0].sends.len(), 1);
    }
    #[test]
    fn mute_wins_and_missing_bus_falls_back() {
        let mut track = channel("t", "track");
        track.settings.output_id = "missing".into();
        track.muted = true;
        track.solo = true;
        let result = routing(&[track]);
        assert!(!result[0].audible);
        assert_eq!(result[0].output_id, "master");
    }
}
#[cfg(test)]
mod return_solo_test {
    use super::*;
    #[test]
    fn return_solo_keeps_its_input_but_mutes_dry_output() {
        let result = routing(&[
            RouteChannel {
                id: "track".into(),
                kind: "track".into(),
                muted: false,
                solo: false,
                settings: crate::MixSettings {
                    sends: vec![Send {
                        bus_id: "return".into(),
                        level_db: 0.,
                        pre_fader: false,
                    }],
                    ..Default::default()
                },
            },
            RouteChannel {
                id: "return".into(),
                kind: "return".into(),
                muted: false,
                solo: true,
                settings: Default::default(),
            },
        ]);
        assert!(result[0].audible);
        assert!(!result[0].output_audible);
        assert!(result[1].audible && result[1].output_audible);
        assert_eq!(result[0].sends.len(), 1);
    }
}
