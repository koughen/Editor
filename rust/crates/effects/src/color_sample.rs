/// Display-referred color coordinates used by the HSL qualifier UI.
/// Saturation follows the shader's HSV chroma normalization; luminance is Rec.709.
pub fn sample_color(rgb: [u8; 3]) -> [f32; 3] {
    let [r, g, b] = rgb.map(|v| v as f32 / 255.0);
    let maximum = r.max(g).max(b);
    let minimum = r.min(g).min(b);
    let delta = maximum - minimum;
    let hue = if delta < 0.00001 {
        0.0
    } else {
        let sector = if maximum == r {
            (g - b) / delta
        } else if maximum == g {
            2.0 + (b - r) / delta
        } else {
            4.0 + (r - g) / delta
        };
        (sector / 6.0).rem_euclid(1.0)
    };
    [
        hue,
        if maximum > 0.0 { delta / maximum } else { 0.0 },
        0.2126 * r + 0.7152 * g + 0.0722 * b,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn picker_matches_shader_coordinates() {
        assert_eq!(sample_color([0, 0, 0]), [0.0; 3]);
        assert_eq!(sample_color([255, 0, 0]), [0.0, 1.0, 0.2126]);
        assert!((sample_color([0, 255, 0])[0] - 1.0 / 3.0).abs() < 0.0001);
        assert_eq!(sample_color([128, 128, 128])[1], 0.0);
    }
}
