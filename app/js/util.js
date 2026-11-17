// Small helpers shared by the modules.
export const $ = (id) => document.getElementById(id);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// deterministic pseudo-random number in [0, 1) for an integer
export function hash(n) {
  n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
