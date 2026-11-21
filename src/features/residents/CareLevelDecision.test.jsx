import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { NotificationDetail } from '@/common/notifications/NotificationDetail'
import { CareLevelDecision } from './CareLevelDecision'

// 001 FR-036b (Q-423; plan-bf08 W7, W14): gia đình không đồng ý đổi mức thì Hành chính ghi giữ mức cũ (kèm thỏa thuận lựa
// chọn có rủi ro đang hiệu lực, ngày xem lại) hoặc rời viện. W12: thông báo nguồn hồ sơ người cao tuổi, yêu cầu thay đổi
// lưu trú mở thẳng màn tương ứng.

let api

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/me/permissions', json(200, [{ function: 'RESIDENCY_CHANGE_REQUEST', operation: 'CREATE' }]))
  api.on(
    'GET',
    '/residents/5/assessments',
    json(200, [{ id: 90, status: 'CONFIRMED', careLevel: 'SPECIAL', confirmedAt: '2026-11-18T03:00:00Z' }]),
  )
  api.on('GET', '/residents/5/care-level-change-decisions', json(200, []))
})

function renderDecision() {
  return render(
    <PermissionsProvider>
      <CareLevelDecision residentId={5} currentCareLevel="REGULAR" residentStatus="IN_RESIDENCE" />
    </PermissionsProvider>,
  )
}

describe('CareLevelDecision', () => {
  it('W7_giuMucCu_canThoaThuanVaNgayXemLai_guiQuyetDinh', async () => {
    api.on(
      'GET',
      '/residents/5/care-plans',
      json(200, [{ id: 1, status: 'EFFECTIVE', riskAgreements: [{ id: 61, choice: 'Uống trà thường' }] }]),
    )
    api.on('POST', '/residents/5/care-level-change-decisions', json(201, { id: 3 }))
    renderDecision()
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi quyết định khi gia đình không đồng ý' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu quyết định' }))
    expect(await within(dialog).findByText('Chọn thỏa thuận lựa chọn có rủi ro')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Thỏa thuận lựa chọn có rủi ro'), { target: { value: '61' } })
    fireEvent.change(within(dialog).getByLabelText('Ngày xem lại'), { target: { value: '2999-01-01' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu quyết định' }))
    await waitFor(() => expect(api.calls('POST', '/residents/5/care-level-change-decisions')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residents/5/care-level-change-decisions')[0][1].body)).toEqual({
      assessmentId: 90,
      decision: 'KEEP_CURRENT_LEVEL',
      riskAgreementId: 61,
      reviewDate: '2999-01-01',
    })
  })

  it('W14_khongCoThoaThuan_tatGiuMucCu_huongDan', async () => {
    api.on('GET', '/residents/5/care-plans', json(200, [{ id: 1, status: 'EFFECTIVE', riskAgreements: [] }]))
    renderDecision()
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi quyết định khi gia đình không đồng ý' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: /Giữ mức cũ/ })).toBeDisabled()
    expect(within(dialog).getByText(/Điều dưỡng lập thỏa thuận trong kế hoạch chăm sóc/)).toBeInTheDocument()
  })

  it('W12_thongBaoNguonHoSo_moManHoSo', async () => {
    api.on(
      'GET',
      '/me/notifications/40',
      json(200, {
        id: 40,
        title: 'Gia đình chọn rời viện',
        level: 'LOW',
        eventType: 'CARE_LEVEL_DECLINED_LEAVE',
        content: [],
        hiddenParts: [],
        identityOnly: false,
        status: 'SENT',
        sentAt: '2026-11-20T03:00:00Z',
        viewedAt: null,
        acknowledgedAt: null,
        sourceRecord: { type: 'M01.RESIDENT', id: '5' },
      }),
    )
    const onNavigate = vi.fn()
    render(<NotificationDetail id={40} onOpened={() => {}} onHidden={() => {}} onNavigate={onNavigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mở hồ sơ người cao tuổi' }))
    expect(onNavigate).toHaveBeenCalledWith('residents', { residentId: 5 })
  })
})
