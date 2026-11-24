export function randomFor(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let bits = Math.imul(state ^ (state >>> 15), state | 1)
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61)
    return ((bits ^ (bits >>> 14)) >>> 0) / 0x1_0000_0000
  }
}
