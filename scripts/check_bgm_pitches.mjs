/**
 * BGM 音高校验：检查每种情绪的旋律音高是否落在合理区间，
 * 避免"全是高频嗡嗡"或"全在超低频听不见"。
 */
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL || 'http://127.0.0.1:5174/Age-of-Discovery/'

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

const result = await page.evaluate(async () => {
  const engine = await import('/Age-of-Discovery/src/utils/bgmEngine.ts')

  const out = {}
  for (const mood of ['calm', 'sail', 'storm', 'event']) {
    const spec = engine.MOODS[mood]
    const rows = []
    for (let bar = 0; bar < 4; bar++) {
      const chord = spec.chords[bar % spec.chords.length]
      const notes = []
      let noteIdx = 0
      for (const durBeats of spec.rhythm) {
        const offset = spec.arpeggioOnly
          ? chord.intervals[noteIdx % chord.intervals.length]
          : spec.scale[noteIdx % spec.scale.length]
        const note = engine.noteFromOffset(chord.root, offset + spec.melodyOctave * 12)
        notes.push({ note, hz: +engine.freq(note).toFixed(1) })
        noteIdx++
      }
      rows.push({ chord: chord.root, notes })
    }
    // 铺底层音高
    const pads = spec.chords.map(c => ({
      root: c.root,
      hz: +engine.freq(c.root).toFixed(1),
    }))
    out[mood] = { rows, pads, beat: spec.beat, pluckVol: spec.pluckVol, padVol: spec.padVol, drumVol: spec.drumVol }
  }
  return out
})

for (const [mood, info] of Object.entries(result)) {
  console.log(`\n═══ ${mood} ═══  (beat=${info.beat}s, pluck=${info.pluckVol}, pad=${info.padVol}, drum=${info.drumVol})`)
  console.log(`  铺底: ${info.pads.map(p => `${p.root}=${p.hz}Hz`).join('  ')}`)
  for (const r of info.rows) {
    const ns = r.notes.map(n => `${n.note}(${n.hz})`).join(' ')
    const lo = Math.min(...r.notes.map(n => n.hz))
    const hi = Math.max(...r.notes.map(n => n.hz))
    console.log(`  ${r.chord.padEnd(4)} ${ns.padEnd(52)} [${lo}–${hi}Hz]`)
  }
}
await browser.close()
