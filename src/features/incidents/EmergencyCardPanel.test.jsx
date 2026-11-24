import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { EmergencyCardPanel } from './EmergencyCardPanel'

// 007 FR-048, FR-048a, BR-M05-13: thẻ thông tin khẩn cấp hiện nguyện vọng cuối đời Hiệu lực (hoặc "chưa có") và nút
// "Xác nhận đã đối chiếu nguyện vọng" (mỗi sự cố một lần); chưa có nguyện vọng thì không có gì để đối chiếu.

let api

const CARD = {
  identification: { fullName: 'Nguyễn Thị An', roomBed: 'P101 / G2' },
  allergies: [],
  currentMedications: [],
  chronicConditions: [],
  endOfLifeWish: { id: 5, choice: 'RETURN_HOME', signerType: 'RESIDENT', note: 'Muốn về quê' },
}

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/incidents/11/emergency-card', json(200, CARD))
})

afterEach(() => vi.unstubAllGlobals())

describe('EmergencyCardPanel', () => {
  it('FR_048a_nguyenVongHieuLuc_hienLuaChon_bamXacNhan_guiLenhRoiBaoDaXacNhan', async () => {
    api.on('POST', '/incidents/11/confirm-wish-check', json(201, {}))
    render(<EmergencyCardPanel incidentId={11} />)
    expect(await screen.findByText('Đưa về nhà')).toBeTruthy()
    expect(screen.getByText(/Muốn về quê/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã đối chiếu nguyện vọng' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/11/confirm-wish-check')).toHaveLength(1))
    const [, init] = api.calls('POST', '/incidents/11/confirm-wish-check')[0]
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy()
    expect(await screen.findByText('Đã xác nhận đối chiếu nguyện vọng')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Xác nhận đã đối chiếu nguyện vọng' })).toBeNull()
  })

  it('FR_048_chuaCoNguyenVong_baoChuaCo_khongCoNutXacNhan', async () => {
    api.on('GET', '/incidents/11/emergency-card', json(200, { ...CARD, endOfLifeWish: { notRecorded: true } }))
    render(<EmergencyCardPanel incidentId={11} />)
    expect(await screen.findByText('Chưa có nguyện vọng cuối đời')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Xác nhận đã đối chiếu nguyện vọng' })).toBeNull()
  })

  it('FR_048a_daXacNhanTruocDo_409_hienTrangThaiDaXacNhan', async () => {
    api.on(
      'POST',
      '/incidents/11/confirm-wish-check',
      problem(409, 'WISH_ALREADY_CHECKED', { detail: 'Sự cố đã có xác nhận đối chiếu nguyện vọng' }),
    )
    render(<EmergencyCardPanel incidentId={11} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận đã đối chiếu nguyện vọng' }))
    expect(await screen.findByText('Đã xác nhận đối chiếu nguyện vọng')).toBeTruthy()
  })

  it('FR_048a_khongDuQuyenXemDuThe_403_hienLoiTaiCho_nutConLai', async () => {
    api.on(
      'POST',
      '/incidents/11/confirm-wish-check',
      problem(403, 'FORBIDDEN', {
        detail: 'Chỉ người được xem đủ thẻ thông tin khẩn cấp mới xác nhận đối chiếu',
      }),
    )
    render(<EmergencyCardPanel incidentId={11} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận đã đối chiếu nguyện vọng' }))
    expect(await screen.findByText(/Chỉ người được xem đủ thẻ/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Xác nhận đã đối chiếu nguyện vọng' })).toBeTruthy()
  })
})
