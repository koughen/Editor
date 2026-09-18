use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cue {
    pub text: String,
    pub start_time: f64,
    pub duration: f64,
}

fn timestamp(seconds: f64, vtt: bool) -> String {
    let ms = (seconds.max(0.0) * 1000.0).round() as u64;
    format!(
        "{:02}:{:02}:{:02}{}{:03}",
        ms / 3_600_000,
        ms / 60_000 % 60,
        ms / 1000 % 60,
        if vtt { '.' } else { ',' },
        ms % 1000
    )
}
pub fn export_subtitles(cues: &[Cue], vtt: bool) -> String {
    let mut cues: Vec<_> = cues
        .iter()
        .filter(|c| {
            c.start_time.is_finite()
                && c.duration.is_finite()
                && c.start_time >= 0.0
                && c.duration > 0.0
                && !c.text.trim().is_empty()
        })
        .collect();
    cues.sort_by(|a, b| a.start_time.total_cmp(&b.start_time));
    let mut out = if vtt {
        "WEBVTT\n\n".to_string()
    } else {
        String::new()
    };
    for (index, cue) in cues.iter().enumerate() {
        let body = cue.text.replace('\r', "").trim().replace("\n\n", "\n");
        let body = if vtt {
            body.replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
        } else {
            body
        };
        out += &format!(
            "{}\n{} --> {}\n{}\n\n",
            index + 1,
            timestamp(cue.start_time, vtt),
            timestamp(cue.start_time + cue.duration, vtt),
            body
        );
    }
    out
}
fn parse_timestamp(value: &str) -> Option<f64> {
    let parts: Vec<f64> = value
        .replace(',', ".")
        .split(':')
        .map(str::parse)
        .collect::<Result<_, _>>()
        .ok()?;
    if !(2..=3).contains(&parts.len()) || parts.iter().any(|v| !v.is_finite() || *v < 0.0) {
        return None;
    }
    let n = parts.len();
    if parts[n - 1] >= 60.0 || parts[n - 2] >= 60.0 {
        return None;
    }
    Some(parts.iter().fold(0.0, |a, v| a * 60.0 + v))
}
pub fn parse_vtt(input: &str) -> Vec<Cue> {
    let normalized = input
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    normalized.split("\n\n").filter_map(|block| {
        let lines: Vec<_> = block.lines().collect();
        if matches!(lines.first(), Some(s) if s.starts_with("NOTE") || s.starts_with("STYLE") || s.starts_with("REGION")) { return None; }
        let i = lines.iter().position(|s| s.contains("-->"))?;
        let (start,end) = lines[i].split_once("-->")?;
        let start_time = parse_timestamp(start.trim())?;
        let end_time = parse_timestamp(end.split_whitespace().next()?)?;
        let mut text = String::new(); let mut tag = false;
        for c in lines[i+1..].join("\n").chars() { if c == '<' { tag = true; } else if c == '>' { tag = false; } else if !tag { text.push(c); } }
        let text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ").replace("&amp;", "&");
        (end_time > start_time && !text.trim().is_empty()).then_some(Cue { text, start_time, duration: end_time - start_time })
    }).collect()
}
pub fn split_cue(cue: &Cue, at: f64) -> Option<[Cue; 2]> {
    if !at.is_finite() || at <= cue.start_time || at >= cue.start_time + cue.duration {
        return None;
    }
    let words: Vec<_> = cue.text.split_whitespace().collect();
    if words.len() < 2 {
        return None;
    }
    let proportion = (at - cue.start_time) / cue.duration;
    let index = ((words.len() as f64 * proportion).round() as usize).clamp(1, words.len() - 1);
    Some([
        Cue {
            text: words[..index].join(" "),
            start_time: cue.start_time,
            duration: at - cue.start_time,
        },
        Cue {
            text: words[index..].join(" "),
            start_time: at,
            duration: cue.start_time + cue.duration - at,
        },
    ])
}

pub fn merge_cues(first: &Cue, second: &Cue) -> Option<Cue> {
    let start = first.start_time.min(second.start_time);
    let end = (first.start_time + first.duration).max(second.start_time + second.duration);
    (start.is_finite() && end.is_finite() && start >= 0.0 && end > start).then(|| Cue {
        text: format!("{} {}", first.text.trim(), second.text.trim()),
        start_time: start,
        duration: end - start,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionClip {
    pub start: f64,
    pub duration: f64,
    pub visual: bool,
    pub in_mode: u8,
    pub in_duration: f64,
}
/// Keep the outgoing source below a reveal at an adjacent cut. Timeline edits
/// remain unchanged; the renderer uses available handles, holding the final
/// source frame when handles run out.
pub fn transition_tails(clips: &[TransitionClip]) -> Vec<f64> {
    let mut tails = vec![0.0; clips.len()];
    for (i, pair) in clips.windows(2).enumerate() {
        let (out, incoming) = (&pair[0], &pair[1]);
        if out.visual
            && incoming.visual
            && matches!(incoming.in_mode, 1 | 4..=7)
            && incoming.in_duration.is_finite()
            && (out.start + out.duration - incoming.start).abs() <= 1.0
        {
            tails[i] = (incoming.in_duration.max(0.0) * time::TICKS_PER_SECOND as f64)
                .min(incoming.duration / 2.0)
                .round();
        }
    }
    tails
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn subtitle_export_round_trips_and_orders_cues() {
        let cues = vec![
            Cue {
                text: "second".into(),
                start_time: 3.0,
                duration: 1.5,
            },
            Cue {
                text: "A & B < C".into(),
                start_time: 1.005,
                duration: 1.0,
            },
        ];
        let vtt = export_subtitles(&cues, true);
        let read = parse_vtt(&vtt);
        assert_eq!(read[0].text, "A & B < C");
        assert_eq!(read[1], cues[0]);
        assert!(export_subtitles(&cues, false).contains("00:00:01,005 --> 00:00:02,005"));
    }
    #[test]
    fn split_preserves_time_and_words() {
        let cue = Cue {
            text: "one two three four".into(),
            start_time: 2.0,
            duration: 4.0,
        };
        let result = split_cue(&cue, 4.0).unwrap();
        assert_eq!(result[0].text, "one two");
        assert_eq!(result[1].text, "three four");
        assert_eq!(result[0].duration + result[1].duration, cue.duration);
        assert!(split_cue(&cue, 6.0).is_none());
    }
    #[test]
    fn transitions_require_an_adjacent_visual_cut() {
        let mut clips = vec![
            TransitionClip {
                start: 0.0,
                duration: 240000.0,
                visual: true,
                in_mode: 0,
                in_duration: 0.0,
            },
            TransitionClip {
                start: 240000.0,
                duration: 120000.0,
                visual: true,
                in_mode: 1,
                in_duration: 5.0,
            },
        ];
        assert_eq!(transition_tails(&clips), [60000.0, 0.0]);
        clips[1].start += 100.0;
        assert_eq!(transition_tails(&clips), [0.0, 0.0]);
    }
}
