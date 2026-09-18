"""Relink this portable XML package to its current folder. Requires Python 3."""
from pathlib import Path
import xml.etree.ElementTree as ET
from urllib.parse import unquote


def prepare():
    root = Path(__file__).resolve().parent
    timeline = root / 'timeline.xml'
    if not timeline.exists():
        return None
    tree = ET.parse(timeline)
    for node in tree.iter('pathurl'):
        path = unquote(node.text or '')
        marker = '/__EDITOR_PACKAGE__/'
        if marker in path:
            relative = path.split(marker, 1)[1]
        elif '/media/' in path:
            relative = 'media/' + path.rsplit('/media/', 1)[1]
        else:
            continue
        resolved = (root / relative).resolve()
        if root not in resolved.parents:
            raise ValueError('Media path leaves the package folder')
        if not resolved.is_file():
            raise FileNotFoundError(str(resolved))
        node.text = resolved.as_uri()
    # ElementTree escapes names/URLs and retains the xmeml root/version.
    tree.write(timeline, encoding='utf-8', xml_declaration=True)
    return timeline


if __name__ == '__main__':
    print('Ready to import:', prepare() or 'No XML in this package')
