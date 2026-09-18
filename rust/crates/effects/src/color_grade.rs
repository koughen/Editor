use crate::{EffectPass, UniformValue};
use bytemuck::{Pod, Zeroable};

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub(super) struct AdvancedGrade {
    pub extra: [f32; 4],
    pub lut_info: [f32; 4],
    pub lut_min: [f32; 4],
    pub lut_max: [f32; 4],
    pub bars: [[f32; 4]; 4],
    pub mixer: [[f32; 4]; 3],
    pub qualifier: [[f32; 4]; 3],
    pub window: [[f32; 4]; 2],
    pub detail: [f32; 4],
    pub log: [f32; 4],
    pub curves: [[f32; 4]; 64],
    pub hue_curves: [[f32; 4]; 64],
    pub sat_curves: [[f32; 4]; 64],
}

pub(super) fn number(pass: &EffectPass, key: &str, default: f32, min: f32, max: f32) -> f32 {
    match pass.uniforms.get(key) {
        Some(UniformValue::Number(value)) if value.is_finite() => value.clamp(min, max),
        _ => default,
    }
}

pub(super) fn lut_data(pass: &EffectPass) -> Option<(u32, &[f32])> {
    let size = number(pass, "lutSize", 0.0, 0.0, 65.0);
    if size < 2.0 || size.fract() != 0.0 {
        return None;
    }
    match pass.uniforms.get("lutData") {
        Some(UniformValue::Vector(data))
            if data.len() == (size as usize).pow(3) * 3
                && data.iter().all(|value| value.is_finite()) =>
        {
            Some((size as u32, data))
        }
        _ => None,
    }
}

pub(super) fn pack(pass: &EffectPass) -> AdvancedGrade {
    let n = |k: &str, d: f32, lo: f32, hi: f32| number(pass, k, d, lo, hi);
    let mut result = AdvancedGrade::zeroed();
    result.lut_info = [
        lut_data(pass).map_or(0.0, |(size, _)| size as f32),
        n("lutMix", 1.0, 0.0, 1.0),
        0.0,
        0.0,
    ];
    result.lut_max = [1.0; 4];
    for (key, target) in [
        ("lutMin", &mut result.lut_min),
        ("lutMax", &mut result.lut_max),
    ] {
        if let Some(UniformValue::Vector(values)) = pass.uniforms.get(key) {
            for i in 0..3 {
                if let Some(value) = values.get(i).filter(|v| v.is_finite()) {
                    target[i] = *value;
                }
            }
        }
    }
    result.extra = [
        n("hue", 0.0, -0.5, 0.5),
        n("colorBoost", 0.0, -1.0, 1.0),
        n("midtoneDetail", 0.0, -1.0, 1.0),
        n("luminanceMix", 0.0, 0.0, 1.0),
    ];
    for (i, key) in ["lift", "gamma", "gain", "offset"].iter().enumerate() {
        result.bars[i] = [
            n(&format!("{key}R"), 0.0, -1.0, 1.0),
            n(&format!("{key}G"), 0.0, -1.0, 1.0),
            n(&format!("{key}B"), 0.0, -1.0, 1.0),
            0.0,
        ];
    }
    for i in 0..3 {
        for j in 0..3 {
            result.mixer[i][j] = n(
                &format!("mix{i}{j}"),
                if i == j { 1.0 } else { 0.0 },
                -2.0,
                2.0,
            );
        }
    }
    result.mixer[0][3] = n("monochrome", 0.0, 0.0, 1.0);
    result.mixer[1][3] = n("preserveLuminance", 0.0, 0.0, 1.0);
    result.mixer[2][3] = n("normalizeMixer", 0.0, 0.0, 1.0);
    result.qualifier[0] = [
        n("qualifierEnabled", 0.0, 0.0, 1.0),
        n("qualifierHue", 0.0, 0.0, 1.0),
        n("qualifierWidth", 1.0, 0.0, 1.0),
        n("qualifierSoftness", 0.05, 0.001, 0.5),
    ];
    result.qualifier[1] = [
        n("satLow", 0.0, 0.0, 1.0),
        n("satHigh", 1.0, 0.0, 1.0),
        n("lumLow", 0.0, 0.0, 1.0),
        n("lumHigh", 1.0, 0.0, 1.0),
    ];
    result.qualifier[2] = [
        n("qualifierInvert", 0.0, 0.0, 1.0),
        n("keyGain", 1.0, 0.0, 1.0),
        0.0,
        0.0,
    ];
    result.window[0] = [
        n("windowType", 0.0, 0.0, 3.0),
        n("windowX", 0.5, 0.0, 1.0),
        n("windowY", 0.5, 0.0, 1.0),
        n("windowWidth", 0.5, 0.01, 2.0),
    ];
    result.window[1] = [
        n("windowHeight", 0.5, 0.01, 2.0),
        n("windowRotation", 0.0, -180.0, 180.0).to_radians(),
        n("windowSoftness", 0.1, 0.001, 1.0),
        n("windowInvert", 0.0, 0.0, 1.0),
    ];
    result.detail = [
        n("blurRadius", 0.0, 0.0, 10.0),
        n("sharpen", 0.0, 0.0, 2.0),
        n("detailMix", 1.0, 0.0, 1.0),
        n("monitorMatte", 0.0, 0.0, 1.0),
    ];
    result.log = [
        n("logMode", 0.0, 0.0, 1.0),
        n("logLow", 0.25, 0.01, 0.49),
        n("logHigh", 0.75, 0.51, 0.99),
        0.0,
    ];
    for (channel, key) in ["curveY", "curveR", "curveG", "curveB"].iter().enumerate() {
        let curve = curve_lut(pass, key, true);
        for i in 0..64 {
            result.curves[i][channel] = curve[i];
        }
    }
    for (channel, key) in ["hueHue", "hueSat", "hueLum", "lumSat"].iter().enumerate() {
        let curve = curve_lut(pass, key, false);
        for i in 0..64 {
            result.hue_curves[i][channel] = curve[i];
        }
    }
    for (channel, key) in ["satSat", "satLum"].iter().enumerate() {
        let curve = curve_lut(pass, key, false);
        for i in 0..64 {
            result.sat_curves[i][channel] = curve[i];
        }
    }
    result
}

fn curve_lut(pass: &EffectPass, key: &str, identity: bool) -> [f32; 64] {
    let default = if identity {
        vec![(0.0, 0.0), (1.0, 1.0)]
    } else {
        vec![(0.0, 0.5), (1.0, 0.5)]
    };
    let mut points = match pass.uniforms.get(key) {
        Some(UniformValue::Vector(values)) => values
            .chunks_exact(2)
            .take(64)
            .filter_map(|pair| {
                (pair[0].is_finite() && pair[1].is_finite())
                    .then_some((pair[0].clamp(0.0, 1.0), pair[1].clamp(0.0, 1.0)))
            })
            .collect::<Vec<_>>(),
        _ => default.clone(),
    };
    if points.len() < 2 {
        points = default;
    }
    points.sort_by(|a, b| a.0.total_cmp(&b.0));
    std::array::from_fn(|i| {
        let x = i as f32 / 63.0;
        let upper = points.partition_point(|p| p.0 < x);
        if upper == 0 {
            return points[0].1;
        }
        if upper == points.len() {
            return points.last().unwrap().1;
        }
        let (x0, y0) = points[upper - 1];
        let (x1, y1) = points[upper];
        let t = ((x - x0) / (x1 - x0).max(0.00001)).clamp(0.0, 1.0);
        y0 + (y1 - y0) * t
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    #[test]
    fn curves_keep_identity_and_interpolate_control_points() {
        let mut pass = EffectPass {
            shader: "color-grade".into(),
            uniforms: HashMap::new(),
        };
        assert_eq!(curve_lut(&pass, "curveY", true)[63], 1.0);
        assert_eq!(curve_lut(&pass, "hueHue", false)[25], 0.5);
        pass.uniforms.insert(
            "curveY".into(),
            UniformValue::Vector(vec![0.0, 0.0, 0.5, 0.75, 1.0, 1.0]),
        );
        assert!(curve_lut(&pass, "curveY", true)[32] > 0.74);
        assert!(std::mem::size_of::<AdvancedGrade>() < 16384 - 128);
    }
}
