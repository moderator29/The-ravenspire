/* SHA-256 and HMAC-SHA256, in plain TypeScript, running identically on the
 * server and in a member's browser.
 *
 * WHY THIS FILE EXISTS AT ALL, given that Node ships `node:crypto` and every
 * browser ships `crypto.subtle`.
 *
 * The chest is provably fair, and the point of a verifier is that a sceptic
 * does not have to take the realm's word for the rerun. That means the roll has
 * to execute on the sceptic's own machine, from code they can read, so the
 * realm is not marking its own homework. `node:crypto` cannot go to the
 * browser. `crypto.subtle` can, but every one of its digest calls is a promise,
 * and `rollChest` is a synchronous pure function called from three server
 * routes: making it async to satisfy the browser would ripple through the
 * opening route, the tests and the settle path, all to accommodate a
 * requirement none of them have.
 *
 * The obvious alternative was worse. Keeping `node:crypto` on the server and
 * writing a second implementation for the browser would mean the realm and the
 * verifier run different code, and the day they disagree the verifier calls an
 * honest opening a forgery. There would be no way to tell that from the other
 * direction, which is precisely the failure this whole feature exists to rule
 * out. So there is exactly ONE implementation, this one, and the server uses it
 * too. A chest is six to eleven HMACs; the cost of not using the native digest
 * is unmeasurable, and what it buys is that the browser literally runs the
 * bytes the realm ran.
 *
 * `sha256.test.ts` pins this against `node:crypto` over the empty string, the
 * NIST vectors, unicode, keys either side of the 64 byte block boundary, and
 * the exact `client:nonce:label` shapes the roll produces. If this file were
 * ever wrong, every commitment the realm has published would be void, so it is
 * checked against an implementation nobody here wrote.
 *
 * No dependency, deliberately. Rule 19 says assume the budget is zero, and a
 * hash is the last thing that should arrive through a supply chain: a
 * compromised hashing package would let the realm's own proof lie.
 */

/* The first thirty two bits of the fractional parts of the cube roots of the
   first sixty four primes. FIPS 180-4, section 4.2.2. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/* The first thirty two bits of the fractional parts of the square roots of the
   first eight primes. FIPS 180-4, section 5.3.3. */
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_BYTES = 64;
const DIGEST_BYTES = 32;

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/* The digest of an arbitrary byte string.
 *
 * The intermediate sums here look like they could overflow and cannot: each
 * addend is under 2^32 and at most five are added, so the total stays under
 * 2^35 and a double holds it exactly. `>>> 0` is what folds it back to
 * thirty two bits, and it is applied at every step rather than at the end,
 * because `>>>` on a value past 2^32 is the classic way a hand written SHA-256
 * produces a digest that is right for short inputs and wrong for long ones. */
export function sha256Bytes(input: Uint8Array): Uint8Array {
  const bitLength = input.length * 8;

  /* Padding: one 0x80 byte, then zeroes, then the length as a big endian
     64 bit count of BITS. The +9 is that byte plus the eight length bytes,
     which is what decides whether the message needs one more block. */
  const blocks = Math.ceil((input.length + 9) / BLOCK_BYTES);
  const padded = new Uint8Array(blocks * BLOCK_BYTES);
  padded.set(input);
  padded[input.length] = 0x80;

  const view = new DataView(padded.buffer);
  /* JavaScript numbers cannot hold a 64 bit bit-count exactly, but they can
     hold anything a real message reaches. The high word is written honestly
     rather than assumed zero. */
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const h = H0.slice();
  const w = new Uint32Array(64);

  for (let block = 0; block < blocks; block += 1) {
    const offset = block * BLOCK_BYTES;

    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) >>> 0;
      const s1 = (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (s0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  const out = new Uint8Array(DIGEST_BYTES);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, h[i]);
  return out;
}

/* HMAC as RFC 2104 defines it. A key longer than the block is hashed first and
   a shorter one is zero padded, which is the part hand written HMACs usually
   get wrong: the realm's server seeds are 64 hex characters, exactly the block
   size, so the boundary case sits right on the value this codebase actually
   uses and the tests pin both sides of it. */
export function hmacSha256Bytes(key: Uint8Array, message: Uint8Array): Uint8Array {
  const normalised = key.length > BLOCK_BYTES ? sha256Bytes(key) : key;

  const inner = new Uint8Array(BLOCK_BYTES + message.length);
  const outer = new Uint8Array(BLOCK_BYTES + DIGEST_BYTES);
  for (let i = 0; i < BLOCK_BYTES; i += 1) {
    const byte = i < normalised.length ? normalised[i] : 0;
    inner[i] = byte ^ 0x36;
    outer[i] = byte ^ 0x5c;
  }
  inner.set(message, BLOCK_BYTES);
  outer.set(sha256Bytes(inner), BLOCK_BYTES);
  return sha256Bytes(outer);
}

const encoder = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/* UTF-8, and it has to be said out loud: the seeds are hex today but a client
   seed is whatever text a member typed, so a member who names their seed in
   Arabic or drops an emoji into it must get the same digest here as the server
   computed. TextEncoder is UTF-8 by specification and exists in both runtimes,
   which is why nothing here hand rolls the encoding. */
export function sha256Hex(text: string): string {
  return toHex(sha256Bytes(encoder.encode(text)));
}

export function hmacSha256Hex(key: string, message: string): string {
  return toHex(hmacSha256Bytes(encoder.encode(key), encoder.encode(message)));
}
