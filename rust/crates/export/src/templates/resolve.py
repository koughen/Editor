"""Import into the current Resolve project using its installed scripting API."""
import sys
from pathlib import Path
from prepare import prepare

roots = [Path('/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules'),
         Path('/opt/resolve/Developer/Scripting/Modules')]
import os
if os.environ.get('PROGRAMDATA'):
    roots.append(Path(os.environ['PROGRAMDATA']) / 'Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting/Modules')
for root in roots:
    if root.is_dir():
        sys.path.append(str(root))
try:
    import DaVinciResolveScript as dvr
except ImportError:
    raise SystemExit('Resolve scripting API not found. Use File > Import > Timeline > timeline.xml instead.')
resolve = dvr.scriptapp('Resolve')
if not resolve:
    raise SystemExit('Open Resolve and enable external scripting, or import timeline.xml manually.')
project = resolve.GetProjectManager().GetCurrentProject()
if not project:
    raise SystemExit('Create or open a Resolve project first, then run this script again.')
timeline = project.GetMediaPool().ImportTimelineFromFile(str(prepare()), {'importSourceClips': True})
if not timeline:
    raise SystemExit('Resolve could not import the timeline. Try File > Import > Timeline.')
project.SetCurrentTimeline(timeline)
print('Imported:', timeline.GetName())
