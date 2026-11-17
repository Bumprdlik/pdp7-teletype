// Machine sounds: synthesized with Web Audio, or recorded samples from sounds/*.wav if present.
import { rnd, pick } from "./util.js";

const S = { ctx: null, master: null, noise: null };
const SMP = { strike: [], cr: [], motor: null };   // optional recorded samples
let crChoice = 0;                                  // which carriage-return sample is used (F8 cycles)
let lid = false;

// browsers only allow sound after a user gesture: called from the POWER ON click
export function initAudio() {
  const a = S.ctx = new (window.AudioContext || window.webkitAudioContext)();
  S.master = a.createGain(); S.master.gain.value = lid ? .2 : .8; S.master.connect(a.destination);
  const len = a.sampleRate * 2; S.noise = a.createBuffer(1, len, a.sampleRate);
  const d = S.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  loadSamples();
}

async function loadSamples() {
  let names = [];
  try { names = await (await fetch("sounds.json")).json(); } catch (e) {}
  await Promise.all(names.map(async (n) => {
    try {
      const buf = await S.ctx.decodeAudioData(await (await fetch("sounds/" + n)).arrayBuffer());
      if (n.startsWith("strike")) SMP.strike.push(buf);
      else if (n.startsWith("cr")) SMP.cr.push({ n, buf });
      else if (n.startsWith("motor")) SMP.motor = buf;
    } catch (e) { console.warn("sample", n, e); }
  }));
  SMP.cr.sort((a, b) => a.n.localeCompare(b.n));
  startMotor();
}

function startMotor() {
  const a = S.ctx;
  if (SMP.motor) {                              // recorded motor loop
    const src = a.createBufferSource(); src.buffer = SMP.motor; src.loop = true;
    const g = a.createGain(); g.gain.value = .32; src.connect(g).connect(S.master); src.start();
  } else {                                      // synthesized motor
    const n = a.createBufferSource(); n.buffer = S.noise; n.loop = true;
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220;
    const mg = a.createGain(); mg.gain.value = .12; n.connect(lp).connect(mg).connect(S.master); n.start();
    const o = a.createOscillator(); o.frequency.value = 60; const og = a.createGain(); og.gain.value = .04;
    o.connect(og).connect(S.master); o.start();
  }
}

function playBuf(buf, gain, rate = 1, delay = 0) {
  const a = S.ctx, src = a.createBufferSource(), g = a.createGain();
  src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
  src.connect(g).connect(S.master); src.start(a.currentTime + delay);
}
function burst(freq, q, dur, gain, delay = 0, type = "bandpass") {
  const a = S.ctx, t = a.currentTime + delay;
  const src = a.createBufferSource(); src.buffer = S.noise;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  src.connect(f).connect(g).connect(S.master); src.start(t, Math.random() * 1.5, dur + .05);
}
function thump(freq, dur, gain, delay = 0) {
  const a = S.ctx, t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * .6, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(S.master); o.start(t); o.stop(t + dur + .02);
}
const snd = {
  strike() { burst(rnd(2000, 3400), 1.1, .035, .9); burst(rnd(650, 950), 2, .06, .45, .004); thump(rnd(100, 140), .05, .5); },
  space() { burst(rnd(800, 1000), 1.5, .03, .3); thump(90, .03, .2); },
  cr() {    // carriage slides left and bangs
    const a = S.ctx, t = a.currentTime, src = a.createBufferSource(); src.buffer = S.noise;
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(1500, t + .2);
    const g = a.createGain(); g.gain.setValueAtTime(.35, t); g.gain.exponentialRampToValueAtTime(.01, t + .24);
    src.connect(f).connect(g).connect(S.master); src.start(t, Math.random(), .3);
    burst(900, 1, .12, 1, .2); thump(75, .14, .9, .2);
  },
  lf() { burst(1300, 3, .05, .5); thump(170, .04, .3); },
  bell() { for (const [fr, gn] of [[1250, .25], [2510, .1]]) { const a = S.ctx, t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.frequency.value = fr; g.gain.setValueAtTime(gn, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.3); o.connect(g).connect(S.master); o.start(t); o.stop(t + 1.4); } },
};

export function play(name) {
  if (!S.ctx) return;
  if (SMP.strike.length) {
    if (name === "strike") return playBuf(pick(SMP.strike), rnd(.75, 1), rnd(.96, 1.04));
    if (name === "space") return playBuf(pick(SMP.strike), rnd(.25, .35), rnd(.85, .9));
    if (name === "lf") return playBuf(pick(SMP.strike), .45, rnd(.7, .75));
    if (name === "cr" && SMP.cr.length) return playBuf(SMP.cr[crChoice % SMP.cr.length].buf, .9);
  }
  snd[name]();
}

// the lid muffles the machine
export function toggleLid() {
  lid = !lid;
  if (S.master) S.master.gain.value = lid ? .2 : .8;
  return lid;
}
export const lidClosed = () => lid;

// F8: switch to the next recorded carriage-return sample; returns its name (null without samples)
export function nextCrSample() {
  if (!SMP.cr.length) return null;
  crChoice = (crChoice + 1) % SMP.cr.length;
  play("cr");
  return SMP.cr[crChoice].n;
}
