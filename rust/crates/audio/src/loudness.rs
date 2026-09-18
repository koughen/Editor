use ebur128::{EbuR128, Mode};
use serde::Serialize;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoudnessReading {
    pub integrated: Option<f64>,
    pub momentary: Option<f64>,
    pub short_term: Option<f64>,
    pub range: Option<f64>,
    pub true_peak: Option<f64>,
    pub seconds: f64,
}
pub struct Loudness {
    meter: EbuR128,
    frames: u64,
    rate: u32,
}
impl Loudness {
    pub fn new(rate: u32) -> Self {
        Self {
            meter: EbuR128::new(
                2,
                rate,
                Mode::I | Mode::S | Mode::LRA | Mode::TRUE_PEAK | Mode::HISTOGRAM,
            )
            .expect("Valid stereo meter"),
            frames: 0,
            rate,
        }
    }
    pub fn add(&mut self, l: &[f32], r: &[f32]) {
        let n = l.len().min(r.len());
        let _ = self.meter.add_frames_planar_f32(&[&l[..n], &r[..n]]);
        self.frames += n as u64;
    }
    pub fn reading(&self) -> LoudnessReading {
        fn finite(v: Result<f64, ebur128::Error>) -> Option<f64> {
            v.ok().filter(|x| x.is_finite())
        }
        let peak = self
            .meter
            .true_peak(0)
            .unwrap_or(0.)
            .max(self.meter.true_peak(1).unwrap_or(0.));
        LoudnessReading {
            integrated: finite(self.meter.loudness_global()),
            momentary: finite(self.meter.loudness_momentary()),
            short_term: finite(self.meter.loudness_shortterm()),
            range: finite(self.meter.loudness_range()),
            true_peak: if peak > 0. {
                Some(20. * peak.log10())
            } else {
                None
            },
            seconds: self.frames as f64 / self.rate as f64,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stereo_reference_and_silence() {
        let mut m = Loudness::new(48000);
        let tone: Vec<f32> = (0..48000 * 4)
            .map(|i| 0.1 * (std::f32::consts::TAU * 1000. * i as f32 / 48000.).sin())
            .collect();
        m.add(&tone, &tone);
        let r = m.reading();
        assert!((r.integrated.unwrap() + 20.).abs() < 0.2, "{:?}", r);
        assert!((r.true_peak.unwrap() + 20.).abs() < 0.1);
        let mut silent = Loudness::new(48000);
        silent.add(&vec![0.; 48000], &vec![0.; 48000]);
        assert!(silent.reading().integrated.is_none());
    }
}
