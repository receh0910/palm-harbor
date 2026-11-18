// Synthesized sound only — no audio assets. Everything is WebAudio oscillators and filtered
// noise, created lazily on the first user gesture (browsers block audio before one) and kept
// silent in headless runs where there is none.
export function createAudio() {
  let ctx = null, master = null, muted = false;
  let engineOsc = null, engineOsc2 = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenLfo = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }

  function env(gain, t0, peak, dur) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone(freq, dur, type, peak, slideTo) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, peak || 0.2, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, peak, freq) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = ctx.createGain(); env(g, t0, peak || 0.3, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    click() { tone(660, 0.07, 'square', 0.12); },
    pickup() { tone(880, 0.12, 'sine', 0.2, 1320); },
    chime() { tone(523, 0.14, 'sine', 0.22); setTimeout(() => tone(659, 0.14, 'sine', 0.22), 110); setTimeout(() => tone(784, 0.28, 'sine', 0.24), 220); },
    fail() { tone(220, 0.3, 'sawtooth', 0.18, 110); },
    punch() { noise(0.12, 0.35, 500); tone(90, 0.12, 'sine', 0.3, 50); },
    gunshot() { noise(0.16, 0.5, 2600); tone(140, 0.1, 'square', 0.25, 60); },
    crash() { noise(0.35, 0.5, 700); tone(70, 0.3, 'sine', 0.35, 35); },
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 750;
        sirenLfo = ctx.createOscillator(); sirenLfo.type = 'square'; sirenLfo.frequency.value = 0.7;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 220;
        sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain(); sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain); sirenGain.connect(master);
        sirenOsc.start(); sirenLfo.start();
      } else if (!on && sirenOsc) {
        try { sirenOsc.stop(); sirenLfo.stop(); } catch { /* already stopped */ }
        sirenOsc = null; sirenLfo = null; sirenGain = null;
      }
    },
    engine(speed01) {
      if (!ensure()) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
        engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 28;
        engineGain = ctx.createGain(); engineGain.gain.value = 0;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
        engineOsc.connect(f); engineOsc2.connect(f); f.connect(engineGain); engineGain.connect(master);
        engineOsc.start(); engineOsc2.start();
      }
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(28 + speed01 * 65, t, 0.08);
      engineGain.gain.setTargetAtTime(muted ? 0 : 0.02 + speed01 * 0.05, t, 0.1);
    },
    engineOff() { if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); },
  };
}
