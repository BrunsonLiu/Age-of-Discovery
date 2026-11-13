/**
 * mulberry32：固定种子的伪随机数（与项目其它程序化内容同一套）。
 *
 * 【为什么单独抽出来】这个函数在 `cloudShadow` / `landGrain` / `harborMood` /
 * `quayLife` 里各抄了一份。抄到第五份的时候该停手了 —— 岸上这一屏要
 * 三套布局（石面 / 摆件 / 人影）用**同一个种子**，各自算各自的随机数，
 * 否则"石块挪一格、摆件就压到人身上"。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
