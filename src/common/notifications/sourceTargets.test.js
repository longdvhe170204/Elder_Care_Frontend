import { afterEach, describe, expect, it, vi } from 'vitest'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { SOURCE_TARGETS } from './sourceTargets'

// Hoàn thiện BF-14 (2026-11-23): nhân viên mở bản ghi nguồn của thông báo đồ gửi
describe('SOURCE_TARGETS (thông báo đồ gửi)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('banGiao_moDoCuaNguoiCaoTuoi', async () => {
    const api = mockRoutes()
    api.on('GET', '/belongings/handovers/23', json(200, { id: 23, belongingId: 9, residentId: 9005, kind: 'LOSS' }))
    expect(await SOURCE_TARGETS['M12.BELONGING_HANDOVER'].resolve('23')).toEqual([
      'belongings',
      { residentId: 9005, belongingId: 9 },
    ])
  })

  it('doGuiCuaNguoiCaoTuoi_vaKiemKe_khongCanGoiApi', async () => {
    expect(await SOURCE_TARGETS['M12.BELONGING_RESIDENT'].resolve('9004')).toEqual([
      'belongings',
      { residentId: 9004 },
    ])
    expect(await SOURCE_TARGETS['M12.INVENTORY_CHECK'].resolve('10')).toEqual([
      'belongings',
      { tab: 'inventory', checkId: 10 },
    ])
    expect(await SOURCE_TARGETS['M12.STORAGE_LOCATION'].resolve('9702')).toEqual(['belongings', { tab: 'inventory' }])
  })

  it('xacNhanNguoiNhan_timNguoiCaoTuoiTheoMa', async () => {
    const api = mockRoutes()
    api.on(
      'GET',
      '/recipient-confirmations',
      json(200, [
        { id: 8, residentId: 9004 },
        { id: 9, residentId: 9005 },
      ]),
    )
    expect(await SOURCE_TARGETS['M12.RECIPIENT_CONFIRMATION'].resolve('9')).toEqual([
      'belongings',
      { residentId: 9005 },
    ])
  })
})
