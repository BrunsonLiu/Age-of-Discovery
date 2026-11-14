import puppeteer from 'puppeteer-core'
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const b=await puppeteer.launch({executablePath:EDGE,headless:true,args:['--no-sandbox']})
const p=await b.newPage(); await p.setViewport({width:1440,height:900})
await p.goto('http://localhost:5174/Age-of-Discovery/',{waitUntil:'networkidle2',timeout:60000})
await p.evaluate(()=>{localStorage.clear();sessionStorage.clear()})
await p.reload({waitUntil:'networkidle2',timeout:60000})
await p.waitForFunction(()=>!!window.__gameStore,{timeout:30000})
const out = await p.evaluate(async () => {
  window.__gameStore.setState({gamePhase:'playing',tutorialStep:-1,showHelp:false,dialogueSeen:['opening_pilot'],activePanel:null})
  const f = await import('/Age-of-Discovery/src/data/factions.ts')
  const ps = await import('/Age-of-Discovery/src/data/ports.ts')
  const id = ps.ports.find(x=>f.portFaction(x.id)==='crown'&&x.services.includes('repair')).id
  const st = window.__gameStore.getState()
  window.__gameStore.setState({
    factionRep:{crown:60,guild:0,scholars:0,brethren:0},
    fleet:{...st.fleet,currentPortId:id,isSailing:false,gold:5000,
      ships: st.fleet.ships.map((sh,i)=> i===0?{...sh,durability:sh.maxDurability-10}:sh)},
  })
  const s2 = window.__gameStore.getState()
  window.__gameStore.getState().setActivePanel('port')
  return {id, ships: s2.fleet.ships.map(s=>[s.id,s.durability,s.maxDurability]), panel: window.__gameStore.getState().activePanel}
})
await new Promise(r=>setTimeout(r,900))
const dom = await p.evaluate(()=>{
  const box = document.querySelector('[data-service-anchor="repair"]')
  const btns = box ? [...box.querySelectorAll('button')].map(b=>b.textContent.trim()) : null
  return {hasBox: !!box, btns, text: box?.textContent?.replace(/\s+/g,' ').slice(0,120)}
})
console.log(JSON.stringify(out), JSON.stringify(dom))
await b.close()
