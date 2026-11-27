import { afterEach, describe, expect, it, vi } from 'vitest'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { SOURCE_TARGETS, sourceNavigation } from './sourceTargets'

// Demo 2026-11-26 (E): nút Xử lý của thông báo mở thẳng màn và bản ghi của luồng kết thúc lưu trú
describe('sourceNavigation', () => {
  it('yeuCauPheDuyet_soDu_hopDong_moDungManVaBanGhi', () => {
    expect(sourceNavigation({ type: 'M15.APPROVAL_REQUEST', id: '12' })).toEqual([
      'approval-requests',
      { requestId: 12 },
    ])
    expect(sourceNavigation({ type: 'M11.BALANCE', id: '9004' })).toEqual([
      'balance',
      { residentId: 9004, focus: 'resident' },
    ])
    expect(sourceNavigation({ type: 'M02.CONTRACT_EXPIRING', id: '9004' })).toEqual(['contracts', { contractId: 9004 }])
    expect(sourceNavigation({ type: 'M11.COST_STATEMENT', id: '31' })).toEqual(['charges', { statementId: 31 }])
    expect(sourceNavigation({ type: 'M02.RESIDENCY_ENDING', id: '14' })).toEqual([
      'residency-endings',
      { endingId: 14 },
    ])
    expect(sourceNavigation({ type: 'M02.ENDING_REQUEST', id: '7' })).toEqual(['residency-endings', { requestId: 7 }])
    expect(sourceNavigation({ type: 'M09.DEPARTMENT', id: '3' })).toBeNull()
    expect(sourceNavigation(null)).toBeNull()
  })
})

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
    expect(await SOURCE_TARGETS['M12.BELONGING_RESIDENT'].resolve('9004')).toEqual(['belongings', { residentId: 9004 }])
    expect(await SOURCE_TARGETS['M12.INVENTORY_CHECK'].resolve('10')).toEqual([
      'belongings',
      { tab: 'inventory', checkId: 10 },
    ])
    expect(await SOURCE_TARGETS['M12.STORAGE_LOCATION'].resolve('9702')).toEqual(['belongings', { tab: 'inventory' }])
    expect(await SOURCE_TARGETS['M12.STAFF_HELD_BELONGINGS'].resolve('9005')).toEqual([
      'belongings',
      { tab: 'held', staffId: 9005 },
    ])
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
