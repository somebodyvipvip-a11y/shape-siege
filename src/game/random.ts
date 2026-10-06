export class SeededRandom {
  private value: number;
  constructor(seed: number) { this.value = seed >>> 0; }
  next = (): number => {
    this.value = (this.value + 0x6D2B79F5) >>> 0;
    let x = this.value;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
