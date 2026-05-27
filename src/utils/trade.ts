import type { PortGood, Good, Fleet } from '@/types'

export function calculateBuyPrice(portGood: PortGood, good: Good): number {
  return Math.round(portGood.price * portGood.priceModifier)
}

export function calculateSellPrice(portGood: PortGood, good: Good): number {
  return Math.round(portGood.price * portGood.priceModifier * 0.85)
}

export function calculateProfit(buyPrice: number, sellPrice: number, quantity: number): number {
  return (sellPrice - buyPrice) * quantity
}

export function getPortGoods(
  portId: number,
  portGoods: PortGood[],
  goods: Good[]
): (PortGood & Good)[] {
  return portGoods
    .filter(pg => pg.portId === portId)
    .map(pg => {
      const good = goods.find(g => g.id === pg.goodId)
      if (!good) return null
      return { ...pg, ...good }
    })
    .filter((item): item is PortGood & Good => item !== null)
}

export function canAfford(gold: number, price: number, quantity: number): boolean {
  return gold >= price * quantity
}

export function hasCargoSpace(fleet: Fleet, quantity: number): boolean {
  const totalCapacity = fleet.ships.reduce((sum, ship) => sum + ship.capacity, 0)
  const totalUsed = fleet.cargo.reduce((sum, item) => sum + item.quantity, 0)
  return totalCapacity - totalUsed >= quantity
}
