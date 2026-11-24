import { it, expect } from 'vitest'
import { NAV_GROUPS, canSee } from '@/common/layout/navigation'

it('T026_menuLapCongViecTheoDungDongQuyenVaKhongMoChoNguoiKhongCoQuyen', () => {
  const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === 'care-task-planning')
  expect(item).toBeDefined()
  expect(item.functions).toEqual(['SHIFT_TASK_PLANNING'])
  expect(canSee(item, 'FLOOR_MANAGER', (fn) => fn === 'SHIFT_TASK_PLANNING')).toBe(true)
  expect(canSee(item, 'FLOOR_MANAGER', () => false)).toBe(false)
  expect(canSee(item, 'OFFICE_STAFF')).toBe(false)
})

it('Q_420_dieuDuongKhongThayMenuLapCongViecCa', () => {
  const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === 'care-task-planning')
  expect(canSee(item, 'NURSING_STAFF', (fn) => fn === 'SHIFT_TASK_PLANNING')).toBe(false)
})
