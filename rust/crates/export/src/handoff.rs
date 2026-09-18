use crate::{Rate, TICKS};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeSet, HashMap};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub fps: f64,
    #[serde(default)]
    pub has_audio: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub track: usize,
    pub start: f64,
    pub duration: f64,
    pub source_in: f64,
    pub speed: f64,
    pub source: Option<Asset>,
    pub visible: bool,
    pub audible: bool,
    pub volume: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
    pub opacity: f64,
    pub text: String,
    pub font_size: f64,
    pub color: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Handoff {
    pub name: String,
    pub target: String,
    pub mode: String,
    pub width: u32,
    pub height: u32,
    pub fps: Rate,
    pub duration: f64,
    pub clips: Vec<Clip>,
    pub warnings: Vec<String>,
    pub files: Vec<Artifact>,
    pub required_media_ids: Vec<String>,
    pub needs_render: bool,
}
#[derive(Debug, Serialize)]
pub struct Artifact {
    pub path: String,
    pub content: String,
}
fn n(v: &Value, key: &str, default: f64) -> f64 {
    v[key].as_f64().filter(|n| n.is_finite()).unwrap_or(default)
}
fn s<'a>(v: &'a Value, key: &str, default: &'a str) -> &'a str {
    v[key].as_str().unwrap_or(default)
}
fn b(v: &Value, key: &str) -> bool {
    v[key].as_bool().unwrap_or(false)
}
fn nonempty(v: &Value) -> bool {
    v.as_array().is_some_and(|a| !a.is_empty()) || v.as_object().is_some_and(|a| !a.is_empty())
}
fn warn(w: &mut BTreeSet<String>, text: impl Into<String>) {
    w.insert(text.into());
}
pub fn safe_name(name: &str) -> String {
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "/\\<>:\"|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(100)
        .collect();
    let safe = safe.trim_matches(|c: char| c == '.' || c.is_whitespace());
    if safe.is_empty() {
        "Untitled".into()
    } else {
        safe.into()
    }
}
pub fn build_handoff_json(input: &str) -> Result<String, String> {
    let v: Value = serde_json::from_str(input).map_err(|e| e.to_string())?;
    serde_json::to_string(&build_handoff(&v)?).map_err(|e| e.to_string())
}
pub fn build_handoff(v: &Value) -> Result<Handoff, String> {
    let target = s(v, "target", "");
    if !["premiere", "resolve", "after-effects", "capcut"].contains(&target) {
        return Err("Choose a supported destination.".into());
    }
    let mode = s(v, "mode", "editable");
    if !["editable", "appearance"].contains(&mode) {
        return Err("Choose an editable or appearance handoff.".into());
    }
    let project = &v["project"];
    let settings = &project["settings"];
    let fps: Rate = serde_json::from_value(settings["fps"].clone())
        .map_err(|_| "Invalid project frame rate.")?;
    let fps = fps.validate()?;
    let width = n(&settings["canvasSize"], "width", 1920.0) as u32;
    let height = n(&settings["canvasSize"], "height", 1080.0) as u32;
    if width == 0 || height == 0 {
        return Err("Invalid project dimensions.".into());
    }
    let media: Vec<Asset> =
        serde_json::from_value(v["media"].clone()).map_err(|e| format!("Invalid media: {e}"))?;
    let media: HashMap<_, _> = media.into_iter().map(|a| (a.id.clone(), a)).collect();
    let tracks = &v["scene"]["tracks"];
    // Bottom-to-top order matches the compositor. Every track keeps its own lane.
    let mut all = vec![&tracks["main"]];
    if let Some(overlay) = tracks["overlay"].as_array() {
        all.extend(overlay.iter().rev());
    }
    if let Some(audio) = tracks["audio"].as_array() {
        all.extend(audio);
    }
    let any_solo = all.iter().any(|t| b(t, "solo"));
    let mut warnings = BTreeSet::new();
    let mut clips = Vec::new();
    let mut ids = BTreeSet::new();
    let mut duration: f64 = 0.0;
    for (index, track) in all.iter().enumerate() {
        if nonempty(&track["audioMix"]) || nonempty(&tracks["audioMaster"]) {
            warn(
                &mut warnings,
                "Mixer EQ, dynamics, routing and automation are baked only in Preserve appearance mode.",
            );
        }
        let Some(elements) = track["elements"].as_array() else {
            continue;
        };
        for e in elements {
            let start = n(e, "startTime", 0.0);
            let length = n(e, "duration", 0.0);
            if start < 0.0 || length <= 0.0 {
                return Err(format!(
                    "{} has an invalid timeline range.",
                    s(e, "name", "Clip")
                ));
            }
            duration = duration.max(start + length);
            let kind = s(e, "type", "");
            let id = s(e, "id", "");
            let source_id = if e["sourceType"] == "library" {
                format!("library-{id}")
            } else {
                s(e, "mediaId", "").to_string()
            };
            let source = media.get(&source_id).cloned();
            if ["video", "audio", "image"].contains(&kind) && source.is_none() {
                return Err(format!(
                    "Missing media for {}. Relink it before exporting.",
                    s(e, "name", "clip")
                ));
            }
            if let Some(ref a) = source {
                ids.insert(a.id.clone());
            }
            let speed = n(&e["retime"], "rate", 1.0);
            if !speed.is_finite() || speed <= 0.0 {
                return Err("Reverse and zero-speed clips need a rendered handoff.".into());
            }
            let visible = !b(track, "hidden") && !b(e, "hidden");
            let audible = !b(track, "muted")
                && !b(e, "muted")
                && (!any_solo || b(track, "solo"))
                && (kind == "audio"
                    || (kind == "video"
                        && e["isSourceAudioEnabled"] != false
                        && source.as_ref().is_some_and(|a| a.has_audio)));
            if nonempty(&e["effects"]) || nonempty(&e["masks"]) || kind == "effect" {
                warn(
                    &mut warnings,
                    "Color grades, effects and masks need Preserve appearance to match the rendered result.",
                );
            }
            if nonempty(&e["animations"]) {
                warn(
                    &mut warnings,
                    "Keyframe animation is retained in the source manifest; the editable handoff uses static starting values.",
                );
            }
            if !["normal", ""].contains(&s(e, "blendMode", "normal")) {
                warn(
                    &mut warnings,
                    "Custom blend modes need Preserve appearance to match compositing.",
                );
            }
            if ["graphic", "sticker", "effect"].contains(&kind) {
                warn(
                    &mut warnings,
                    "Graphics, stickers and adjustment layers are included in the source manifest and appearance render, but are not recreated as native editable layers.",
                );
            }
            if kind == "text" {
                warn(
                    &mut warnings,
                    if ["premiere", "resolve"].contains(&target) {
                        "Text is supplied as timed SRT subtitles; import timeline.srt separately. Styling needs Preserve appearance."
                    } else {
                        "Text layers use basic styling; fonts, layout, backgrounds and text effects may differ."
                    },
                );
            }
            if n(e, "fadeIn", 0.0) > 0.0 || n(e, "fadeOut", 0.0) > 0.0 {
                warn(
                    &mut warnings,
                    "Audio fades and pitch-preserving retiming need Preserve appearance to match the original mix.",
                );
            }
            if speed != 1.0 && ["premiere", "resolve"].contains(&target) {
                warn(
                    &mut warnings,
                    "Speed changes use XML time remapping; verify these clips in the destination app.",
                );
            }
            if !visible && kind != "audio" {
                warn(
                    &mut warnings,
                    "Hidden visual clips are disabled in XML/After Effects; CapCut omits them from its generated draft.",
                );
            }
            let transform = &e["transform"];
            if (n(transform, "scaleX", 1.0) - n(transform, "scaleY", 1.0)).abs() > 0.00001
                && ["premiere", "resolve"].contains(&target)
            {
                warn(
                    &mut warnings,
                    "Non-uniform scaling is approximated by horizontal scale in XML. Use Preserve appearance for exact framing.",
                );
            }
            let source_fit = source
                .as_ref()
                .filter(|a| a.width > 0.0 && a.height > 0.0)
                .map(|a| (width as f64 / a.width).min(height as f64 / a.height))
                .unwrap_or(1.0);
            clips.push(Clip {
                id: id.into(),
                name: s(e, "name", "Clip").into(),
                kind: kind.into(),
                track: index,
                start: start / TICKS,
                duration: length / TICKS,
                source_in: n(e, "trimStart", 0.0) / TICKS,
                speed,
                source,
                visible,
                audible,
                volume: n(e, "volume", 1.0).max(0.0),
                scale_x: n(transform, "scaleX", 1.0) * source_fit,
                scale_y: n(transform, "scaleY", 1.0) * source_fit,
                x: n(&transform["position"], "x", 0.0),
                y: n(&transform["position"], "y", 0.0),
                rotation: n(transform, "rotate", 0.0),
                opacity: n(e, "opacity", 1.0),
                text: s(e, "content", "").into(),
                font_size: n(e, "fontSize", 48.0),
                color: s(e, "color", "#ffffff").into(),
            });
        }
    }
    if duration <= 0.0 {
        return Err("Add a clip before creating a handoff.".into());
    }
    if settings["background"]["type"] == "blur"
        || !["#000000", "black", "transparent"].contains(&s(
            &settings["background"],
            "color",
            "black",
        ))
    {
        warn(
            &mut warnings,
            "Project background is baked in Preserve appearance; editable timelines use the destination's default background.",
        );
    }
    if target == "capcut" {
        warn(
            &mut warnings,
            "CapCut draft generation is experimental and requires Python plus pycapcut. Its upstream exporter targets Windows CapCut; Mac compatibility varies. The rendered MP4 remains directly importable.",
        );
    }
    if mode == "appearance" {
        let mut cuts: Vec<i64> = clips
            .iter()
            .flat_map(|c| {
                [
                    fps.frames(c.start * TICKS),
                    fps.frames((c.start + c.duration) * TICKS),
                ]
            })
            .collect();
        cuts.push(0);
        cuts.push(((duration / TICKS * fps.value()) - 1e-9).ceil() as i64);
        cuts.sort();
        cuts.dedup();
        let full_duration = (*cuts.last().unwrap() as f64) / fps.value();
        let source = Asset {
            id: "__render__".into(),
            name: "Rendered timeline.mp4".into(),
            path: "media/Rendered timeline.mp4".into(),
            width: width as f64,
            height: height as f64,
            duration: full_duration,
            fps: fps.value(),
            has_audio: true,
        };
        clips = cuts
            .windows(2)
            .filter(|c| c[1] > c[0])
            .enumerate()
            .map(|(i, c)| Clip {
                id: format!("render-{i}"),
                name: format!("Edit {:03}", i + 1),
                kind: "video".into(),
                track: 0,
                start: c[0] as f64 / fps.value(),
                duration: (c[1] - c[0]) as f64 / fps.value(),
                source_in: c[0] as f64 / fps.value(),
                speed: 1.0,
                source: Some(source.clone()),
                visible: true,
                audible: true,
                volume: 1.0,
                scale_x: 1.0,
                scale_y: 1.0,
                x: 0.0,
                y: 0.0,
                rotation: 0.0,
                opacity: 1.0,
                text: String::new(),
                font_size: 48.0,
                color: "#ffffff".into(),
            })
            .collect();
        warnings.retain(|w| w.starts_with("CapCut"));
        warn(
            &mut warnings,
            "Appearance is rendered into one video and split at edit boundaries. Overlapping layers, grades and the mixed audio are baked; original editable settings remain in source-project.json.",
        );
    }
    let mut handoff = Handoff {
        name: safe_name(s(&project["metadata"], "name", "Untitled")),
        target: target.into(),
        mode: mode.into(),
        width,
        height,
        fps,
        duration: duration / TICKS,
        clips,
        warnings: warnings.into_iter().collect(),
        files: vec![],
        required_media_ids: ids.into_iter().collect(),
        needs_render: mode == "appearance",
    };
    let mut manifest = serde_json::to_value(&handoff).unwrap();
    manifest.as_object_mut().unwrap().remove("files");
    let mut add = |path: &str, content: String| {
        handoff.files.push(Artifact {
            path: path.into(),
            content,
        })
    };
    add(
        "handoff.json",
        serde_json::to_string_pretty(&manifest).unwrap(),
    );
    add("source-project.json",serde_json::to_string_pretty(&json!({"project":project,"scene":v["scene"],"media":v["media"],"ticksPerSecond":TICKS})).unwrap());
    add("prepare.py", include_str!("templates/prepare.py").into());
    match target {
        "after-effects" => handoff.files.push(Artifact {
            path: "Open in After Effects.jsx".into(),
            content: include_str!("templates/after-effects.jsx").replace(
                "__HANDOFF_DATA__",
                &manifest
                    .to_string()
                    .replace('\u{2028}', "\\u2028")
                    .replace('\u{2029}', "\\u2029"),
            ),
        }),
        "capcut" => handoff.files.push(Artifact {
            path: "import-capcut.py".into(),
            content: include_str!("templates/capcut.py").into(),
        }),
        _ => {
            let xml = make_xml(&handoff);
            handoff.files.push(Artifact {
                path: "timeline.xml".into(),
                content: xml,
            });
        }
    }
    if target == "resolve" {
        handoff.files.push(Artifact {
            path: "import-resolve.py".into(),
            content: include_str!("templates/resolve.py").into(),
        });
    }
    if mode == "editable" {
        handoff.files.push(Artifact {
            path: "timeline.srt".into(),
            content: make_srt(&handoff.clips),
        });
    }
    handoff.files.push(Artifact {
        path: "README.txt".into(),
        content: instructions(&handoff),
    });
    Ok(handoff)
}
fn xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
pub fn url_path(s: &str) -> String {
    s.as_bytes()
        .iter()
        .map(|&b| {
            if b.is_ascii_alphanumeric() || b"/-_.~".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
fn rate_xml(fps: f64) -> String {
    let nominal = fps.round();
    let ntsc = (fps - nominal * 1000.0 / 1001.0).abs() < 0.002;
    format!(
        "<rate><timebase>{nominal:.0}</timebase><ntsc>{}</ntsc></rate>",
        if ntsc { "TRUE" } else { "FALSE" }
    )
}
fn make_xml(h: &Handoff) -> String {
    let rate = rate_xml(h.fps.value());
    let frames = |seconds: f64| h.fps.frames(seconds * TICKS);
    let mut video = String::new();
    let mut audio = String::new();
    let lanes: BTreeSet<_> = h.clips.iter().map(|c| c.track).collect();
    for lane in lanes {
        let mut vs = String::new();
        let mut left = String::new();
        let mut right = String::new();
        for (i, c) in h.clips.iter().enumerate().filter(|(_, c)| c.track == lane) {
            let Some(a) = &c.source else { continue };
            let source_fps = if a.fps > 0.0 { a.fps } else { h.fps.value() };
            let source_rate = rate_xml(source_fps);
            let source_in = if c.kind == "image" {
                0
            } else {
                (c.source_in * source_fps).round() as i64
            };
            let source_out = source_in + (c.duration * c.speed * source_fps).round() as i64;
            let duration = (a.duration * source_fps).round().max(source_out as f64) as i64;
            let file = |suffix: &str| {
                format!(
                    "<file id=\"file-{i}-{suffix}\"><name>{}</name><pathurl>file://localhost/__EDITOR_PACKAGE__/{}</pathurl>{source_rate}<duration>{duration}</duration><media><video><samplecharacteristics><width>{}</width><height>{}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video><audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio></media></file>",
                    xml(&a.name),
                    xml(&url_path(&a.path)),
                    a.width.max(1.0),
                    a.height.max(1.0)
                )
            };
            let body = format!(
                "<name>{}</name>{source_rate}<duration>{duration}</duration><start>{}</start><end>{}</end><in>{source_in}</in><out>{source_out}</out>",
                xml(&c.name),
                frames(c.start),
                frames(c.start + c.duration)
            );
            let speed = if c.speed != 1.0 {
                format!(
                    "<filter><effect><name>Time Remap</name><effectid>timeremap</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype><parameter><parameterid>speed</parameterid><name>speed</name><value>{}</value></parameter></effect></filter>",
                    c.speed * 100.0
                )
            } else {
                String::new()
            };
            if c.kind != "audio" {
                let scale = c.scale_x * 100.0;
                let motion = format!(
                    "<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype><parameter><parameterid>scale</parameterid><value>{scale}</value></parameter><parameter><parameterid>rotation</parameterid><value>{}</value></parameter><parameter><parameterid>center</parameterid><value><horiz>{}</horiz><vert>{}</vert></value></parameter></effect></filter><filter><effect><name>Opacity</name><effectid>opacity</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype><parameter><parameterid>opacity</parameterid><value>{}</value></parameter></effect></filter>",
                    c.rotation,
                    c.x / h.width as f64,
                    c.y / h.height as f64,
                    c.opacity * 100.0
                );
                vs.push_str(&format!("<clipitem id=\"video-{i}\">{body}<enabled>{}</enabled>{}{}{motion}{speed}</clipitem>",if c.visible{"TRUE"}else{"FALSE"},if c.kind=="image"{"<stillframe>TRUE</stillframe>"}else{""},file("v")));
            }
            if a.has_audio || c.kind == "audio" {
                for (channel, buf) in [(1, &mut left), (2, &mut right)] {
                    buf.push_str(&format!("<clipitem id=\"audio-{i}-{channel}\">{body}<enabled>{}</enabled>{}<sourcetrack><mediatype>audio</mediatype><trackindex>{channel}</trackindex></sourcetrack><filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory><effecttype>audiolevels</effecttype><mediatype>audio</mediatype><parameter><parameterid>level</parameterid><value>{}</value></parameter></effect></filter>{speed}</clipitem>",if c.audible{"TRUE"}else{"FALSE"},file(&format!("a{channel}")),c.volume));
                }
            }
        }
        if !vs.is_empty() {
            video.push_str(&format!(
                "<track>{vs}<enabled>TRUE</enabled><locked>FALSE</locked></track>"
            ));
        }
        if !left.is_empty() {
            audio.push_str(&format!("<track>{left}<outputchannelindex>1</outputchannelindex></track><track>{right}<outputchannelindex>2</outputchannelindex></track>"));
        }
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE xmeml>\n<xmeml version=\"5\"><sequence id=\"editor-sequence\"><name>{}</name><duration>{}</duration>{rate}<timecode>{rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode><media><video><format><samplecharacteristics>{rate}<width>{}</width><height>{}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>{video}</video><audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>{audio}</audio></media></sequence></xmeml>",
        xml(&h.name),
        ((h.duration * h.fps.value()) - 1e-9).ceil() as i64,
        h.width,
        h.height
    )
}
fn make_srt(clips: &[Clip]) -> String {
    fn stamp(t: f64) -> String {
        let ms = (t * 1000.0).round() as u64;
        format!(
            "{:02}:{:02}:{:02},{:03}",
            ms / 3600000,
            ms / 60000 % 60,
            ms / 1000 % 60,
            ms % 1000
        )
    }
    let mut text: Vec<_> = clips
        .iter()
        .filter(|c| c.kind == "text" && c.visible)
        .collect();
    text.sort_by(|a, b| a.start.total_cmp(&b.start));
    text.iter()
        .enumerate()
        .map(|(i, c)| {
            format!(
                "{}\n{} --> {}\n{}\n\n",
                i + 1,
                stamp(c.start),
                stamp(c.start + c.duration),
                c.text
            )
        })
        .collect()
}
fn instructions(h: &Handoff) -> String {
    let steps = match h.target.as_str() {
        "after-effects" => {
            "In After Effects: File > Scripts > Run Script File, then choose Open in After Effects.jsx. The script creates a composition in the current project. Save as .aep when ready."
        }
        "premiere" => {
            "Run python3 prepare.py after extracting this folder. In Premiere Pro: File > Import > timeline.xml. If prompted, relink to this folder's media directory. Save the imported project as .prproj."
        }
        "resolve" => {
            "Run python3 prepare.py after extracting this folder. In Resolve: File > Import > Timeline > timeline.xml. Alternatively run import-resolve.py with Resolve scripting enabled. Save the project in Resolve."
        }
        _ => {
            "CapCut does not publish a stable project interchange API. Experimental draft: install Python and pycapcut (python3 -m pip install pycapcut), then run python3 import-capcut.py --drafts \"YOUR CAPCUT DRAFTS FOLDER\". Get the folder from CapCut Settings. Restart CapCut to see the new draft. Upstream supports Windows; Mac compatibility varies. Preserve appearance also supplies media/Rendered timeline.mp4, which can be imported directly into CapCut on either platform."
        }
    };
    format!(
        "{} — {} handoff\n\n{}\n\nExport scope: current scene. Canvas: {} × {}. Frame rate: {}/{}.\nKeep the media folder beside these files. Do not move it after importing.\n{}\n\nCompatibility notes\n{}\n\nsource-project.json retains the original timeline, settings and source metadata. handoff.json describes the converted timeline.\n",
        h.name,
        h.target,
        steps,
        h.width,
        h.height,
        h.fps.numerator,
        h.fps.denominator,
        if h.mode == "editable" {
            "Text is also supplied as timeline.srt; import it separately into Premiere/Resolve."
        } else {
            "The rendered timeline is split at edit boundaries. Effects and overlapping layers are baked into video; audio is a stereo mix."
        },
        h.warnings
            .iter()
            .map(|w| format!("- {w}"))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(target: &str, mode: &str) -> Value {
        json!({"target":target,"mode":mode,"project":{"metadata":{"name":"A & B <test>"},"settings":{"canvasSize":{"width":1920,"height":1080},"fps":{"numerator":30000,"denominator":1001},"background":{"type":"color","color":"#000000"}}},
        "media":[{"id":"m1","name":"a & b.mp4","path":"media/0-a & b.mp4","width":3840,"height":2160,"duration":20,"fps":30000.0/1001.0,"hasAudio":true}],
        "scene":{"tracks":{"main":{"type":"video","name":"Main","elements":[{"id":"c1","name":"One & two","type":"video","mediaId":"m1","startTime":120000,"duration":240240,"trimStart":360360,"opacity":0.8,"volume":0.5,"transform":{"scaleX":1,"scaleY":1,"position":{"x":0,"y":0}}}]},"overlay":[{"type":"text","elements":[{"id":"t1","name":"Title","type":"text","content":"Hi <there>","startTime":60000,"duration":120000}]}],"audio":[]}}})
    }
    #[test]
    fn xml_preserves_gaps_trims_fractional_rate_and_audio() {
        let h = build_handoff(&fixture("premiere", "editable")).unwrap();
        let content = &h
            .files
            .iter()
            .find(|f| f.path == "timeline.xml")
            .unwrap()
            .content;
        let doc = roxmltree::Document::parse_with_options(
            content,
            roxmltree::ParsingOptions {
                allow_dtd: true,
                ..Default::default()
            },
        )
        .unwrap();
        let clip = doc
            .descendants()
            .find(|n| n.attribute("id") == Some("video-0"))
            .unwrap();
        let value = |tag| {
            clip.children()
                .find(|n| n.has_tag_name(tag))
                .unwrap()
                .text()
                .unwrap()
        };
        assert_eq!(value("start"), "30");
        assert_eq!(value("end"), "90");
        assert_eq!(value("in"), "90");
        assert_eq!(value("out"), "150");
        assert_eq!(value("name"), "One & two");
        assert!(content.contains("media/0-a%20%26%20b.mp4"));
        assert!(content.contains("<ntsc>TRUE</ntsc>"));
        assert_eq!(
            doc.descendants()
                .filter(|n| n.has_tag_name("clipitem"))
                .count(),
            3
        );
        let ids: Vec<_> = doc
            .descendants()
            .filter_map(|n| n.attribute("id"))
            .collect();
        let unique: BTreeSet<_> = ids.iter().collect();
        assert_eq!(ids.len(), unique.len());
        assert!(
            h.files
                .iter()
                .find(|f| f.path == "timeline.srt")
                .unwrap()
                .content
                .contains("00:00:00,500 --> 00:00:01,500")
        );
    }
    #[test]
    fn appearance_covers_gaps_and_boundaries_without_losing_duration() {
        let h = build_handoff(&fixture("capcut", "appearance")).unwrap();
        assert!(h.needs_render);
        assert_eq!(h.clips[0].start, 0.0);
        for pair in h.clips.windows(2) {
            assert!((pair[0].start + pair[0].duration - pair[1].start).abs() < 1e-9);
        }
        assert!(
            h.clips.last().unwrap().start + h.clips.last().unwrap().duration >= h.duration - 1e-9
        );
        assert!(
            h.clips
                .iter()
                .all(|c| c.source.as_ref().unwrap().path == "media/Rendered timeline.mp4")
        );
        assert!(h.warnings.iter().any(|w| w.contains("baked")));
    }
    #[test]
    fn missing_media_stops_handoff_instead_of_silently_dropping_clips() {
        let mut v = fixture("resolve", "editable");
        v["media"] = json!([]);
        assert!(build_handoff(&v).unwrap_err().contains("Missing media"));
    }
    #[test]
    fn muted_audio_hidden_layers_and_unsupported_effects_are_explicit() {
        let mut v = fixture("after-effects", "editable");
        v["scene"]["tracks"]["main"]["muted"] = json!(true);
        v["scene"]["tracks"]["main"]["hidden"] = json!(true);
        v["scene"]["tracks"]["main"]["elements"][0]["effects"] = json!([{"type":"color-grade"}]);
        let h = build_handoff(&v).unwrap();
        assert!(!h.clips[0].audible);
        assert!(!h.clips[0].visible);
        assert!(h.warnings.iter().any(|w| w.contains("Color grades")));
        assert!(
            h.files
                .iter()
                .any(|f| f.path.ends_with(".jsx") && !f.content.contains("__HANDOFF_DATA__"))
        );
    }
    #[test]
    fn filenames_and_urls_are_portable() {
        assert_eq!(safe_name("../../A:B\n"), "_.._A_B_");
        assert_eq!(url_path("media/é #%.mp4"), "media/%C3%A9%20%23%25.mp4");
    }
    #[test]
    fn fixture_packages_for_manual_import_checks() {
        // Opt-in artifact emission makes the same tested fixture available to destination apps.
        if let Ok(root) = std::env::var("EDITOR_EXPORT_FIXTURES") {
            for target in ["premiere", "resolve", "after-effects", "capcut"] {
                let h = build_handoff(&fixture(target, "editable")).unwrap();
                let path = std::path::Path::new(&root).join(target);
                std::fs::create_dir_all(&path).unwrap();
                for file in h.files {
                    std::fs::write(path.join(file.path), file.content).unwrap();
                }
            }
        }
    }
}
