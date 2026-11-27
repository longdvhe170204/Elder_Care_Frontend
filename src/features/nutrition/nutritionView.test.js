import { expect, it } from 'vitest'
import {
  assignmentState,
  cellDishes,
  dishCommands,
  familyFoodCommands,
  menuCommands,
  mondayOf,
  slipCommands,
  slipGroupName,
  weekDays,
  weekdayLabel,
} from './nutritionView'

it('lệnh món theo trạng thái, chỉ của bếp (FR-004a, Q-445)', () => {
  expect(dishCommands({ status: 'DRAFT' }, { kitchen: true })).toEqual(['activate', 'cancel'])
  expect(dishCommands({ status: 'ACTIVE' }, { kitchen: true })).toEqual(['deactivate'])
  expect(dishCommands({ status: 'DRAFT' }, { kitchen: false })).toEqual([])
  expect(dishCommands({ status: 'CANCELLED' }, { kitchen: true })).toEqual([])
})

it('lệnh thực đơn: bếp gửi duyệt, Quản lý viện công bố hoặc trả lại (FR-029, Q-445)', () => {
  expect(menuCommands({ status: 'DRAFT' }, { kitchen: true })).toEqual(['submit', 'cancel'])
  expect(menuCommands({ status: 'PENDING_PUBLICATION' }, { kitchen: true })).toEqual(['withdraw'])
  expect(menuCommands({ status: 'PENDING_PUBLICATION' }, { manager: true })).toEqual(['publish', 'return'])
  expect(menuCommands({ status: 'PUBLISHED' }, { kitchen: true, manager: true })).toEqual([])
})

it('lệnh phiếu tách phía bếp và phía tầng (FR-047, FR-048)', () => {
  expect(slipCommands({ status: 'PREPARED' }, { kitchen: true })).toEqual(['deliver'])
  expect(slipCommands({ status: 'DELIVERED' }, { kitchen: true })).toEqual([])
  expect(slipCommands({ status: 'DELIVERED' }, { receiver: true })).toEqual(['receive', 'report-discrepancy'])
})

it('lệnh đồ ăn gia đình theo trạng thái (FR-055)', () => {
  expect(familyFoodCommands({ status: 'NEEDS_CONFIRMATION' })).toEqual(['approve-use', 'reject-use'])
  expect(familyFoodCommands({ status: 'ENDED' })).toEqual([])
})

it('tuần bắt đầu thứ Hai, mã ngày ISO', () => {
  expect(mondayOf('2026-11-08')).toBe('2026-11-02')
  expect(weekDays('2026-11-02')).toHaveLength(7)
  expect(weekdayLabel('2026-11-02')).toBe('Thứ Hai, 02/11')
  expect(weekdayLabel('2026-11-08')).toBe('Chủ nhật, 08/11')
})

it('món của ô thực đơn chung, tên phiếu nhân viên, bản gán hiện hành', () => {
  const content = {
    dishes: [
      { date: '2026-11-02', mealId: 1, dishId: 7 },
      { date: '2026-11-02', mealId: 2, dishId: 8 },
      { date: '2026-11-02', mealId: 1, dishId: 9 },
    ],
  }
  expect(cellDishes(content, '2026-11-02', 1).map((r) => r.dishId)).toEqual([7, 9])
  expect(slipGroupName({ group: 'STAFF' }, [])).toBe('Phiếu nhân viên')
  expect(slipGroupName({ group: 'FLOOR', floorArea: 'Tầng 2' }, [])).toBe('Tầng 2')
  const s = assignmentState([
    { id: 1, status: 'DISCONTINUED' },
    { id: 2, status: 'ACTIVE' },
    { id: 3, status: 'PENDING_EFFECTIVE' },
  ])
  expect(s.current.id).toBe(2)
  expect(s.pending.map((a) => a.id)).toEqual([3])
})
