import type { PortGood, Fleet } from '@/types'

export function calculateBuyPrice(portGood: PortGood): number {
  return Math.round(portGood.price * portGood.priceModifier)
}

export function calculateSellPrice(portGood: PortGood): number {
  return Math.round(portGood.price * portGood.priceModifier * 0.85)
}

export function canAfford(gold: number, price: number, quantity: number): boolean {
  return gold >= price * quantity
}

export function hasCargoSpace(fleet: Fleet, quantity: number): boolean {
  const totalCapacity = fleet.ships.reduce((sum, ship) => sum + ship.capacity, 0)
  const totalUsed = fleet.cargo.reduce((sum, item) => sum + item.quantity, 0)
  return totalCapacity - totalUsed >= quantity
}
