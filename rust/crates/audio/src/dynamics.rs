//! Stereo-linked cleanup with state carried across render quanta. No allocation in process().
use crate::CleanupSettings;
fn db(x: f64) -> f64 {
    20. * x.max(1e-12).log10()
}
fn gain(x: f64) -> f64 {
    10f64.powf(x / 20.)
}
fn coefficient(ms: f64, rate: f64) -> f64 {
    (-1. / (ms * 0.001 * rate)).exp()
}
fn follow(current: &mut f64, target: f64, attack: f64, release: f64) {
    let c = if target < *current { attack } else { release };
    *current = c * *current + (1. - c) * target;
}
pub struct Dynamics {
    rate: f64,
    settings: CleanupSettings,
    low: [[f64; 5]; 2],
    noise_env: [f64; 6],
    noise_gain: [f64; 6],
    high_low: [f64; 2],
    detector: f64,
    sibilance: f64,
    duck_detector: f64,
    gate_gain: f64,
    deess_gain: f64,
    duck_gain: f64,
    pub reduction: f32,
}
impl Dynamics {
    pub fn new(rate: f64) -> Self {
        Self {
            rate,
            settings: Default::default(),
            low: [[0.; 5]; 2],
            noise_env: [0.; 6],
            noise_gain: [1.; 6],
            high_low: [0.; 2],
            detector: 0.,
            sibilance: 0.,
            duck_detector: 0.,
            gate_gain: 1.,
            deess_gain: 1.,
            duck_gain: 1.,
            reduction: 0.,
        }
    }
    pub fn update(&mut self, settings: CleanupSettings) {
        self.settings = settings.normalized();
    }
    pub fn process(&mut self, left: &mut [f32], right: &mut [f32], side: &[f32]) {
        let s = &self.settings;
        let smooth = coefficient(15., self.rate);
        let fast = coefficient(2., self.rate);
        let slow = coefficient(70., self.rate);
        let cross = [150_f64, 500., 1500., 4000., 9000.]
            .map(|f| (-std::f64::consts::TAU * f.min(self.rate * 0.45) / self.rate).exp());
        let deess_c =
            (-std::f64::consts::TAU * s.deess_frequency.min(self.rate * 0.45) / self.rate).exp();
        let ga = coefficient(s.gate_attack, self.rate);
        let gr = coefficient(s.gate_release, self.rate);
        let da = coefficient(s.duck_attack, self.rate);
        let dr = coefficient(s.duck_release, self.rate);
        for i in 0..left.len().min(right.len()) {
            let mut x = [left[i] as f64, right[i] as f64];
            for v in &mut x {
                if !v.is_finite() {
                    *v = 0.;
                }
            }
            if s.noise_enabled {
                let mut bands = [[0.; 6]; 2];
                for ch in 0..2 {
                    let mut previous = 0.;
                    for (b, &c) in cross.iter().enumerate() {
                        self.low[ch][b] = c * self.low[ch][b] + (1. - c) * x[ch];
                        bands[ch][b] = self.low[ch][b] - previous;
                        previous = self.low[ch][b];
                    }
                    bands[ch][5] = x[ch] - previous;
                }
                x = [0.; 2];
                for b in 0..6 {
                    let level = bands[0][b].abs().max(bands[1][b].abs());
                    let c = if level > self.noise_env[b] {
                        fast
                    } else {
                        slow
                    };
                    self.noise_env[b] = c * self.noise_env[b] + (1. - c) * level;
                    // Soft multiband suppression: full reduction below the floor, unity 12 dB above it.
                    let openness = ((db(self.noise_env[b]) - s.noise_floor) / 12.).clamp(0., 1.);
                    let target = gain(-s.noise_reduction * (1. - openness));
                    self.noise_gain[b] = smooth * self.noise_gain[b] + (1. - smooth) * target;
                    for ch in 0..2 {
                        x[ch] += bands[ch][b] * self.noise_gain[b];
                    }
                }
            }
            let level = x[0].abs().max(x[1].abs());
            let c = if level > self.detector { fast } else { slow };
            self.detector = c * self.detector + (1. - c) * level;
            let gate = if s.gate_enabled {
                gain(((db(self.detector) - s.gate_threshold) * (s.gate_ratio - 1.)).clamp(-80., 0.))
            } else {
                1.
            };
            // Opening a gate must use attack; closing uses release (opposite compressor gain movement).
            follow(&mut self.gate_gain, gate, gr, ga);
            if s.deess_enabled {
                let mut high = [0.; 2];
                for ch in 0..2 {
                    self.high_low[ch] = deess_c * self.high_low[ch] + (1. - deess_c) * x[ch];
                    high[ch] = x[ch] - self.high_low[ch];
                }
                let level = high[0].abs().max(high[1].abs());
                let c = if level > self.sibilance { fast } else { slow };
                self.sibilance = c * self.sibilance + (1. - c) * level;
                let target = gain(
                    -(db(self.sibilance) - s.deess_threshold)
                        .max(0.)
                        .min(s.deess_amount),
                );
                follow(&mut self.deess_gain, target, fast, slow);
                for ch in 0..2 {
                    x[ch] = self.high_low[ch] + high[ch] * self.deess_gain;
                }
            } else {
                self.deess_gain = 1.;
            }
            let trigger = side.get(i).copied().unwrap_or(0.).abs() as f64;
            let c = if trigger > self.duck_detector {
                fast
            } else {
                slow
            };
            self.duck_detector = c * self.duck_detector + (1. - c) * trigger;
            let duck = if s.duck_enabled {
                gain(
                    -s.duck_amount
                        * ((db(self.duck_detector) - s.duck_threshold) / 6.).clamp(0., 1.),
                )
            } else {
                1.
            };
            follow(&mut self.duck_gain, duck, da, dr);
            left[i] = (x[0] * self.gate_gain * self.duck_gain) as f32;
            right[i] = (x[1] * self.gate_gain * self.duck_gain) as f32;
        }
        self.reduction = db(self.gate_gain * self.duck_gain * self.deess_gain) as f32;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn tone(amp: f32, freq: f32) -> Vec<f32> {
        (0..48000)
            .map(|i| amp * (std::f32::consts::TAU * freq * i as f32 / 48000.).sin())
            .collect()
    }
    fn power(v: &[f32]) -> f32 {
        v[24000..].iter().map(|x| x * x).sum::<f32>() / 24000.
    }
    #[test]
    fn neutral_exact() {
        let mut d = Dynamics::new(48000.);
        let mut l = tone(0.5, 440.);
        let orig = l.clone();
        let mut r = l.clone();
        d.process(&mut l, &mut r, &[]);
        assert_eq!(l, orig);
    }
    #[test]
    fn gate_reduces_quiet_and_preserves_loud() {
        for (amp, quiet) in [(0.001, true), (0.5, false)] {
            let mut d = Dynamics::new(48000.);
            d.update(CleanupSettings {
                gate_enabled: true,
                ..Default::default()
            });
            let mut l = tone(amp, 440.);
            let initial = power(&l);
            let mut r = l.clone();
            d.process(&mut l, &mut r, &[]);
            let ratio = power(&l) / initial;
            assert!(if quiet { ratio < 0.01 } else { ratio > 0.99 });
        }
    }
    #[test]
    fn duck_uses_external_sidechain() {
        let mut d = Dynamics::new(48000.);
        d.update(CleanupSettings {
            duck_enabled: true,
            ..Default::default()
        });
        let mut l = tone(0.5, 440.);
        let mut r = l.clone();
        let initial = power(&l);
        d.process(&mut l, &mut r, &tone(0.5, 220.));
        assert!(power(&l) / initial < 0.08);
    }
    #[test]
    fn noise_and_sibilance_reduce_target() {
        for noise in [true, false] {
            let mut d = Dynamics::new(48000.);
            d.update(CleanupSettings {
                noise_enabled: noise,
                deess_enabled: !noise,
                ..Default::default()
            });
            let mut l = tone(if noise { 0.0001 } else { 0.5 }, 9000.);
            let initial = power(&l);
            let mut r = l.clone();
            d.process(&mut l, &mut r, &[]);
            assert!(power(&l) / initial < 0.6);
        }
    }
}
