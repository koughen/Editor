"""Experimental CapCut draft builder. See README.txt before running."""
import argparse
import json
import uuid
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--drafts', required=True, type=Path, help='Existing CapCut drafts folder from Settings')
    args = parser.parse_args()
    if not args.drafts.is_dir():
        parser.error('The drafts folder must already exist. Choose it from CapCut Settings.')
    try:
        import pycapcut as cc
    except ImportError:
        raise SystemExit('Install the optional adapter first: python3 -m pip install pycapcut')
    root = Path(__file__).resolve().parent
    data = json.loads((root / 'handoff.json').read_text(encoding='utf-8'))
    for clip in data['clips']:
        if clip['source'] and not (root / clip['source']['path']).is_file():
            raise FileNotFoundError(clip['source']['path'])
    # New draft only. Never replace an existing CapCut project.
    name = data['name'] + ' - Editor ' + uuid.uuid4().hex[:8]
    fps = data['fps']['numerator'] / data['fps']['denominator']
    draft = cc.DraftFolder(str(args.drafts)).create_draft(name, data['width'], data['height'], fps=fps, allow_replace=False)
    # A full-length bottom lane prevents CapCut's magnetic main track from removing gaps.
    import struct, zlib
    def chunk(tag, body):
        return struct.pack('>I', len(body)) + tag + body + struct.pack('>I', zlib.crc32(tag + body) & 0xffffffff)
    background = Path(draft.save_path).parent / 'background.png'
    background.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00\x00\x00\x00')) + chunk(b'IEND', b''))
    draft.add_track(cc.TrackType.video, 'Timeline background', relative_index=0)
    draft.add_segment(cc.VideoSegment(str(background), cc.Timerange(0, round(data['duration']*1e6))), 'Timeline background')
    tracks = set()
    for clip in data['clips']:
        kind = clip['kind']
        if kind not in ('video', 'image', 'audio', 'text'):
            continue
        if (kind == 'audio' and not clip['audible']) or (kind != 'audio' and not clip['visible']):
            continue
        track_name = 'Editor track ' + str(clip['track'])
        track_type = cc.TrackType.audio if kind == 'audio' else cc.TrackType.text if kind == 'text' else cc.TrackType.video
        if track_name not in tracks:
            # Offset visual tracks so CapCut's magnetic main track cannot close intentional gaps.
            draft.add_track(track_type, track_name, relative_index=clip['track'] + 1)
            tracks.add(track_name)
        target = cc.Timerange(round(clip['start'] * 1e6), round(clip['duration'] * 1e6))
        volume = clip['volume'] if clip['audible'] else 0
        source = clip['source']
        if kind == 'audio':
            segment = cc.AudioSegment(str(root / source['path']), target,
                source_timerange=cc.Timerange(round(clip['sourceIn']*1e6), round(clip['duration']*clip['speed']*1e6)), volume=volume)
        else:
            fit = min(data['width'] / max(1, source['width']), data['height'] / max(1, source['height'])) if source else 1
            transform = cc.ClipSettings(alpha=clip['opacity'], rotation=clip['rotation'],
                scale_x=clip['scaleX']/fit, scale_y=clip['scaleY']/fit,
                transform_x=2*clip['x']/data['width'], transform_y=-2*clip['y']/data['height'])
            if kind == 'text':
                segment = cc.TextSegment(clip['text'], target, clip_settings=transform)
            else:
                kwargs = {'clip_settings': transform, 'volume': volume}
                if kind != 'image':
                    kwargs['source_timerange'] = cc.Timerange(round(clip['sourceIn']*1e6), round(clip['duration']*clip['speed']*1e6))
                segment = cc.VideoSegment(str(root / source['path']), target, **kwargs)
        draft.add_segment(segment, track_name)
    draft.save()
    print('Created:', args.drafts / name)
    print('Restart CapCut to refresh the project list. Keep this media package in place.')
    print('Experimental adapter: upstream supports Windows CapCut. Mac compatibility varies.')


if __name__ == '__main__':
    main()
