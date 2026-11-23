import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AlertsPage } from './AlertsPage'

// 007 FR-047i, BR-M05-29: nhân viên trong ca gửi yêu cầu hỗ trợ theo tầng, nơi, không cần tên người cao tuổi; khác nút SOS
// của người cao tuổi. Gửi trước rồi mới gửi nơi; hiện ai đang tới.

let api

const SENT = { pressId: 1, alertId: 70, status: 'SENT', receiverName: null }

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/alerts', json(200, []))
  api.on('GET', '/incident-types', json(200, []))
  api.on('GET', '/me/permissions', json(200, [{ function: 'EMERGENCY_ASSIST_BUTTON', operation: 'CREATE' }]))
  api.on('GET', '/incident-floors', json(200, [{ id: 7, name: 'Tầng 1', current: true }]))
})

afterEach(() => vi.unstubAllGlobals())

function renderPage() {
  return render(
    <PermissionsProvider>
      <AlertsPage />
    </PermissionsProvider>,
  )
}

describe('AssistRequest', () => {
  it('FR_047i_guiYeuCau_roiGuiNoi_khongCanTenNguoiCaoTuoi', async () => {
    api.on('POST', '/emergency-assist', json(201, SENT))
    api.on('POST', '/emergency-assist/70/details', json(200, {}))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Cần hỗ trợ' }))
    expect(await screen.findByText('Tầng 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hành lang' }))
    fireEvent.change(screen.getByLabelText(/Ghi rõ nơi/), { target: { value: ' gần phòng 101 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ngay' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist/70/details')).toHaveLength(1))
    expect(new Headers(api.calls('POST', '/emergency-assist')[0][1].headers).get('Idempotency-Key')).toBeTruthy()
    expect(JSON.parse(api.calls('POST', '/emergency-assist/70/details')[0][1].body)).toEqual({
      eventType: 'FALL',
      place: 'CORRIDOR',
      placeNote: 'gần phòng 101',
    })
    expect(await screen.findByText('Đã gửi yêu cầu hỗ trợ.')).toBeTruthy()
  })

  it('FR_047i_khongChonGi_vanGuiDuoc', async () => {
    api.on('POST', '/emergency-assist', json(201, SENT))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Cần hỗ trợ' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi ngay' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist')).toHaveLength(1))
    expect(api.calls('POST', '/emergency-assist/70/details')).toHaveLength(0)
  })

  it('FR_047i_ngoaiCa_baoLoiTrongHop', async () => {
    api.on('POST', '/emergency-assist', problem(409, 'NOT_ON_SHIFT', { detail: 'Bạn không trong ca' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Cần hỗ trợ' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi ngay' }))
    expect(await screen.findByText('Bạn không trong ca')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Gửi ngay' })).toBeTruthy()
  })

  it('FR_047j_hienNguoiDangToi', async () => {
    api.on('GET', '/emergency-assist/current', json(200, { ...SENT, status: 'RECEIVED', receiverName: 'Trần Thu Hà' }))
    renderPage()
    expect((await screen.findByRole('region', { name: 'Yêu cầu hỗ trợ của bạn' })).textContent).toMatch(
      /Trần Thu Hà đang tới/,
    )
  })

  it('FR_080_khongCoQuyen_khongHienNut', async () => {
    api.on('GET', '/me/permissions', json(200, []))
    renderPage()
    await screen.findByText('Không có cảnh báo đang mở trong phạm vi của bạn.')
    expect(screen.queryByRole('button', { name: 'Cần hỗ trợ' })).toBeNull()
  })
})
