// Editor handoff: File > Scripts > Run Script File.
(function () {
    var data = __HANDOFF_DATA__;
    var folder = new File($.fileName).parent;
    var missing = [];
    for (var m = 0; m < data.clips.length; m++) {
        var source = data.clips[m].source;
        if (source && !(new File(folder.fsName + '/' + source.path)).exists) missing.push(source.path);
    }
    if (missing.length) { alert('Missing media. Keep the media folder beside this script.\n' + missing.join('\n')); return; }
    if (!app.project) app.newProject();
    app.beginUndoGroup('Import Editor timeline');
    try {
        var fps = data.fps.numerator / data.fps.denominator;
        var comp = app.project.items.addComp(data.name, data.width, data.height, 1, Math.ceil(data.duration * fps - 0.000000001) / fps, fps);
        var imported = {};
        // Bottom to top: AE adds each layer above the previous one.
        for (var i = 0; i < data.clips.length; i++) {
            var c = data.clips[i], layer, footage;
            if (c.source) {
                var key = '$' + c.source.id;
                if (!imported[key]) {
                    var options = new ImportOptions(new File(folder.fsName + '/' + c.source.path));
                    options.sequence = false;
                    imported[key] = app.project.importFile(options);
                }
                footage = imported[key];
                layer = comp.layers.add(footage);
                layer.stretch = 100 / c.speed;
                layer.startTime = c.start - c.sourceIn / c.speed;
                if (c.kind === 'audio') layer.enabled = false;
                else layer.enabled = c.visible;
                if (layer.hasAudio) {
                    layer.audioEnabled = c.audible;
                    var db = c.volume > 0 ? Math.max(-192, 20 * Math.log(c.volume) / Math.LN10) : -192;
                    layer.property('ADBE Audio Group').property('ADBE Audio Levels').setValue([db, db]);
                }
            } else if (c.kind === 'text') {
                layer = comp.layers.addText(c.text);
                var prop = layer.property('ADBE Text Properties').property('ADBE Text Document');
                var style = prop.value;
                style.fontSize = c.fontSize;
                if (/^#[0-9a-f]{6}$/i.test(c.color)) style.fillColor = [parseInt(c.color.substr(1,2),16)/255, parseInt(c.color.substr(3,2),16)/255, parseInt(c.color.substr(5,2),16)/255];
                style.justification = ParagraphJustification.CENTER_JUSTIFY;
                prop.setValue(style);
                layer.startTime = c.start;
                layer.enabled = c.visible;
            } else { continue; }
            layer.name = c.name;
            layer.inPoint = c.start;
            layer.outPoint = c.start + c.duration;
            if (c.kind !== 'audio') {
                var tr = layer.property('ADBE Transform Group');
                tr.property('ADBE Position').setValue([data.width / 2 + c.x, data.height / 2 + c.y]);
                tr.property('ADBE Scale').setValue([c.scaleX * 100, c.scaleY * 100]);
                tr.property('ADBE Rotate Z').setValue(c.rotation);
                tr.property('ADBE Opacity').setValue(c.opacity * 100);
            }
        }
        comp.openInViewer();
        if (data.warnings.length) alert('Timeline imported. Review these transfer notes:\n\n' + data.warnings.join('\n\n'));
    } catch (error) { alert('Import stopped: ' + error.toString()); }
    finally { app.endUndoGroup(); }
})();
