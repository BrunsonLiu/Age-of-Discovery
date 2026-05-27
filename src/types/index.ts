export interface Ship {
  id: number
  name: string
  type: 'caravel' | 'galleon' | 'sloop' | 'frigate'
  speed: number
  durability: number
  maxDurability: number
  capacity: number
  usedCapacity: number
  crew: number
  maxCrew: number
}

export interface Fleet {
  id: number
  name: string
  gold: number
  morale: number
  food: number
  water: number
  currentPortId: number | null
  isSailing: boolean
  day: number
  ships: Ship[]
  cargo: CargoItem[]
}

export interface CargoItem {
  goodId: number
  quantity: number
}

export interface Port {
  id: number
  name: string
  nameCn: string
  latitude: number
  longitude: number
  region: 'caribbean' | 'europe' | 'africa' | 'asia'
  description: string
  services: ('repair' | 'supply' | 'recruit' | 'trade')[]
}

export interface Good {
  id: number
  name: string
  nameCn: string
  basePrice: number
  category: 'food' | 'luxury' | 'material' | 'weapon' | 'spice'
}

export interface PortGood {
  portId: number
  goodId: number
  price: number
  stock: number
  priceModifier: number
}

export interface Route {
  id: number
  fromPortId: number
  toPortId: number
  distance: number
  dangerLevel: 1 | 2 | 3 | 4 | 5
  windFavor: number
}

export interface GameEvent {
  id: number
  type: 'storm' | 'pirate' | 'disease' | 'accident' | 'discovery' | 'historical'
  title: string
  description: string
  triggerCondition: {
    minDay?: number
    region?: string
    dangerLevelMin?: number
    probability: number
  }
  choices: EventChoice[]
}

export interface EventChoice {
  text: string
  outcomes: EventOutcome[]
}

export interface EventOutcome {
  probability: number
  goldChange: number
  foodChange: number
  waterChange: number
  moraleChange: number
  durabilityChange: number
  crewChange: number
  description: string
  historicalNote?: string
}

export interface Task {
  id: number
  title: string
  description: string
  type: 'main' | 'trade' | 'escort' | 'treasure' | 'rescue'
  status: 'available' | 'active' | 'completed' | 'failed'
  reward: { gold: number; fame?: number }
  portId: number
  targetPortId?: number
  requiredGoods?: { goodId: number; quantity: number }[]
}

export interface EventLogEntry {
  event: GameEvent
  choiceIndex: number
  outcome: EventOutcome
  day: number
}

export interface Waypoint {
  latitude: number
  longitude: number
  name?: string
  portId?: number
}

export interface GameState {
  fleet: Fleet
  currentRoute: Route | null
  routeProgress: number
  waypoint: Waypoint | null
  completedTasks: number[]
  activeTasks: Task[]
  eventLog: EventLogEntry[]
  discoveredPorts: number[]
  currentEvent: GameEvent | null
  gamePhase: 'start' | 'playing' | 'event' | 'gameover'
}

export type PanelType = 'fleet' | 'port' | 'event' | 'task' | 'trade' | null
