/* Platform adapter only: all DSP and loudness analysis run in the Rust module. */
class EditorAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.wasm = new WebAssembly.Instance(options.processorOptions.module).exports;
    this.ptr = this.wasm.create(sampleRate, options.processorOptions.meter ? 1 : 0);
    this.offset = this.wasm.buffer(this.ptr) / 4;
    this.frames = 0;
    this.active = true;
    this.dead = false;
    this.port.onmessage = ({ data }) => {
      if (data.active !== undefined) this.active = data.active;
      if (data.sync) { this.port.postMessage({sync:data.sync}); return; }
      if (data.dispose) { this.wasm.destroy(this.ptr); this.dead = true; return; }
      if (data.parameters) {
        new Float32Array(this.wasm.memory.buffer).set(data.parameters, this.offset + 12288);
        this.wasm.configure(this.ptr);
      }
    };
    if (options.processorOptions.parameters) {
      new Float32Array(this.wasm.memory.buffer).set(options.processorOptions.parameters, this.offset + 12288);
      this.wasm.configure(this.ptr);
    }
  }
  process(inputs, outputs) {
    if (this.dead) return false;
    const n = outputs[0][0].length;
    const memory = new Float32Array(this.wasm.memory.buffer);
    for (let c = 0; c < 3; c++) {
      const start = this.offset + 4096 * c;
      memory.fill(0, start, start + n);
      const source = c < 2 ? inputs[0]?.[c] ?? inputs[0]?.[0] : inputs[1]?.[0];
      if (source) memory.set(source, start);
    }
    if (this.active) this.wasm.process(this.ptr, n);
    const updated = new Float32Array(this.wasm.memory.buffer);
    outputs[0][0].set(updated.subarray(this.offset, this.offset + n));
    outputs[0][1]?.set(updated.subarray(this.offset + 4096, this.offset + 4096 + n));
    if(this.active) this.frames += n;
    if (this.frames >= sampleRate / 10) {
      this.frames = 0;
      this.wasm.reading(this.ptr);
      this.port.postMessage(Array.from(new Float32Array(this.wasm.memory.buffer, (this.offset + 12288) * 4, 6)));
    }
    return true;
  }
}
registerProcessor('editor-audio', EditorAudioProcessor);
