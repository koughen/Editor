import Foundation
import AVFoundation
import AudioToolbox

func result(_ value: Any) throws { let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]); print("EDITOR_AUDIO_RESULT " + String(decoding: data, as: UTF8.self)) }
func fail(_ message: String) -> NSError { NSError(domain: "EditorAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
func description(_ id: String) throws -> AudioComponentDescription {
 let parts = id.split(separator: ":").compactMap { UInt32($0) }
 guard parts.count == 3, [kAudioUnitType_Effect,kAudioUnitType_MusicEffect].contains(parts[0]) else { throw fail("Invalid Audio Unit effect") }
 return AudioComponentDescription(componentType: parts[0], componentSubType: parts[1], componentManufacturer: parts[2], componentFlags: 0, componentFlagsMask: 0)
}
func instantiate(_ id: String) throws -> AVAudioUnit {
 var unit: AVAudioUnit?; var failure: Error?; var done = false
 AVAudioUnit.instantiate(with: try description(id), options: []) { value, error in unit=value;failure=error;done=true }
 let deadline = Date().addingTimeInterval(30)
 while !done && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
 if let failure = failure { throw failure }; guard let unit = unit else {throw fail("Audio Unit did not load within 30 seconds")}; return unit
}
do {
 let args=CommandLine.arguments
 switch args.count > 1 ? args[1] : "" {
 case "list":
  var list = [[String:Any]]()
  for type in [kAudioUnitType_Effect,kAudioUnitType_MusicEffect] {
   let desc=AudioComponentDescription(componentType:type,componentSubType:0,componentManufacturer:0,componentFlags:0,componentFlagsMask:0)
   for c in AVAudioUnitComponentManager.shared().components(matching:desc) {let d=c.audioComponentDescription;list.append(["id":"\(d.componentType):\(d.componentSubType):\(d.componentManufacturer)","name":c.name,"manufacturer":c.manufacturerName])}
  }
  try result(list.sorted { String(describing:$0["name"]!) < String(describing:$1["name"]!) })
 case "parameters":
  guard args.count==3 else {throw fail("Missing effect ID")};let unit=try instantiate(args[2])
  let parameters=(unit.auAudioUnit.parameterTree?.allParameters ?? []).filter { $0.flags.contains(.flag_IsWritable) }.map { p -> [String:Any] in ["id":String(p.address),"name":p.displayName,"min":p.minValue,"max":p.maxValue,"value":p.value,"unit":p.unitName ?? "","values":p.valueStrings ?? []] }
  try result(parameters)
 case "render":
  guard args.count==5 else {throw fail("Missing render files")}
  let config=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:args[4]))) as? [[String:Any]] ?? []
  let input=try AVAudioFile(forReading:URL(fileURLWithPath:args[2]));let format=input.processingFormat
  guard format.channelCount==2 else {throw fail("Audio Unit input must be stereo")}
  let engine=AVAudioEngine();let player=AVAudioPlayerNode();engine.attach(player);var previous:AVAudioNode=player
  var units=[AVAudioUnit]()
  for insert in config where !(insert["bypass"] as? Bool ?? false) {
   guard let id=insert["id"] as? String else {throw fail("Invalid effect configuration")};let unit=try instantiate(id);units.append(unit);engine.attach(unit)
   for (key,value) in insert["parameters"] as? [String:Double] ?? [:] {if let address=UInt64(key),let parameter=unit.auAudioUnit.parameterTree?.parameter(withAddress:address) {parameter.value=max(parameter.minValue,min(parameter.maxValue,Float(value)))}}
   engine.connect(previous,to:unit,format:format);previous=unit
  }
  engine.connect(previous,to:engine.mainMixerNode,format:format)
  try engine.enableManualRenderingMode(.offline,format:format,maximumFrameCount:4096)
  let output=try AVAudioFile(forWriting:URL(fileURLWithPath:args[3]),settings:format.settings,commonFormat:.pcmFormatFloat32,interleaved:false)
  guard let buffer=AVAudioPCMBuffer(pcmFormat:engine.manualRenderingFormat,frameCapacity:4096) else {throw fail("Could not allocate render buffer")}
  player.scheduleFile(input,at:nil);try engine.start();player.play();var stalled=0
  while engine.manualRenderingSampleTime < input.length {
   let frames=AVAudioFrameCount(min(4096,input.length-engine.manualRenderingSampleTime))
   let status=try engine.renderOffline(frames,to:buffer)
   switch status {
   case .success:try output.write(from:buffer);stalled=0
   case .cannotDoInCurrentContext,.insufficientDataFromInputNode:stalled+=1;if stalled>2000 {throw fail("Audio Unit could not render offline")};Thread.sleep(forTimeInterval:0.001)
   case .error:throw fail("Audio Unit rendering failed")
   @unknown default:throw fail("Unknown Audio Unit render status")
   }
  }
  player.stop();engine.stop();try result(["frames":input.length,"sampleRate":format.sampleRate])
 default:throw fail("Unknown Audio Unit command")
 }
}catch {try? result(["error":error.localizedDescription]);exit(1)}
