import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { LiveNotificationsPage } from './LiveNotificationsPage'

// 009 (FR-033, FR-034, FR-026) và 013 T019 (FR-017, FR-030): trang Thông báo của cổng người thân đọc hộp thông báo thật;
// thông báo RECIPIENT_CONFIRMATION_REQUESTED (nguồn M12.RECIPIENT_CONFIRMATION, mã là mã yêu cầu) mở được yêu cầu xác
// nhận người nhận để người đại diện thấy người nhận rồi xác nhận hoặc từ chối (bắt buộc lý do).

let api

const notification = (extra = {}) => ({
  id: 1,
  level: 'MEDIUM',
  eventType: 'RECIPIENT_CONFIRMATION_REQUESTED',
  title: 'Có yêu cầu xác nhận người nhận đồ gửi',
  content: [],
  hiddenParts: [],
  identityOnly: false,
  status: 'SENT',
  sentAt: '2026-11-15T02:00:00Z',
  viewedAt: null,
  acknowledgedAt: null,
  sourceRecord: { type: 'M12.RECIPIENT_CONFIRMATION', id: '61', canOpen: true },
  ...extra,
})

const request = {
  id: 61,
  recipientName: 'Trần Thị N',
  recipientIdDocument: '999',
  belongingIds: [90, 91],
  status: 'PENDING_CONFIRMATION',
}

function serve(n) {
  api.on(
    'GET',
    '/me/notifications',
    json(200, { items: [n], unreadCount: 1, unacknowledgedUrgentCount: 0, nextCursor: null }),
  )
  api.on('GET', '/me/notifications/1', json(200, n))
  api.on('GET', '/family-portal/recipient-confirmations/61', json(200, request))
}

const viewer = { name: 'Lê Văn Minh', representative: true }

async function openRequest() {
  render(<LiveNotificationsPage viewer={viewer} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Có yêu cầu xác nhận người nhận đồ gửi' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Xem yêu cầu xác nhận' }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  api = mockRoutes()
})

describe('LiveNotificationsPage', () => {
  it('FR_017_moYeuCauTuThongBao_xacNhanGuiIdempotencyKey', async () => {
    serve(notification())
    api.on('POST', '/family-portal/recipient-confirmations/61/confirm', json(200, {}))
    const dialog = await openRequest()

    expect(await within(dialog).findByText('Người nhận: Trần Thị N')).toBeInTheDocument()
    expect(within(dialog).getByText('Giấy tờ: 999')).toBeInTheDocument()
    expect(within(dialog).getByText('Đồ trong yêu cầu: 2 đồ (mã 90, 91)')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận người nhận' }))

    expect(await within(dialog).findByText('Đã xác nhận. Viện được trả đồ cho người này.')).toBeInTheDocument()
    const [, init] = api.calls('POST', '/family-portal/recipient-confirmations/61/confirm')[0]
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('FR_017_tuChoiBatBuocLyDo_roiGuiLyDo', async () => {
    serve(notification())
    api.on('POST', '/family-portal/recipient-confirmations/61/reject', json(200, {}))
    const dialog = await openRequest()

    await within(dialog).findByText('Người nhận: Trần Thị N')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi từ chối' }))
    expect(within(dialog).getByText('Nhập lý do từ chối')).toBeInTheDocument()
    expect(api.calls('POST', '/family-portal/recipient-confirmations/61/reject')).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText('Lý do từ chối'), { target: { value: 'Không quen người này' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi từ chối' }))
    await waitFor(() => expect(api.calls('POST', '/family-portal/recipient-confirmations/61/reject')).toHaveLength(1))
    const [, init] = api.calls('POST', '/family-portal/recipient-confirmations/61/reject')[0]
    expect(JSON.parse(init.body)).toEqual({ reason: 'Không quen người này' })
  })

  it('FR_015_nguoiDaiDien_thayYeuCauThayDoiQuyenChoXacNhan_xacNhanDuoc', async () => {
    serve(notification({ eventType: 'COST_FINALIZED', title: 'Bảng chi phí tháng 10 đã chốt', sourceRecord: null }))
    api.on(
      'GET',
      '/right-change-requests',
      json(200, [
        {
          id: 4,
          residentId: 9,
          type: 'RIGHT',
          relationshipId: 30,
          right: 'VIEW_COSTS',
          newValue: true,
          reason: 'Gia đình muốn xem chi phí',
          status: 'PENDING_CONFIRMATION',
          source: 'COUNTER',
          familyMemberName: 'Trần Thu Hà',
        },
      ]),
    )
    api.on('POST', '/right-change-requests/4/confirm', json(200, {}))
    render(<LiveNotificationsPage viewer={{ ...viewer, residentId: 9 }} />)

    // Test BF-12 (2026-11-24): thẻ nêu tên người thân bị tác động
    expect(await screen.findByText('Bật quyền Xem chi phí cho Trần Thu Hà')).toBeInTheDocument()
    expect(screen.getByText('Lý do: Gia đình muốn xem chi phí')).toBeInTheDocument()
    const [call] = api.calls('GET', '/right-change-requests')
    expect(call[0]).toContain('residentId=9')
    expect(call[0]).toContain('status=PENDING_CONFIRMATION')

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận yêu cầu' }))
    await waitFor(() => expect(api.calls('POST', '/right-change-requests/4/confirm')).toHaveLength(1))
    expect(api.calls('POST', '/right-change-requests/4/confirm')[0][1].headers['Idempotency-Key']).toMatch(
      /^[0-9a-f-]{36}$/,
    )
    expect(await screen.findByText('Đã xác nhận yêu cầu.')).toBeInTheDocument()
  })

  it('FR_015_khongPhaiNguoiDaiDien_khongTaiYeuCau', async () => {
    serve(notification({ eventType: 'COST_FINALIZED', title: 'Bảng chi phí tháng 10 đã chốt', sourceRecord: null }))
    render(<LiveNotificationsPage viewer={{ name: 'Lê M', representative: false, residentId: 9 }} />)

    await screen.findByRole('button', { name: 'Bảng chi phí tháng 10 đã chốt' })
    expect(api.calls('GET', '/right-change-requests')).toHaveLength(0)
    expect(screen.queryByText('Chờ bạn quyết định')).not.toBeInTheDocument()
  })

  it('FR_034_thongBaoNguonKhac_khongCoNutMoYeuCau', async () => {
    serve(notification({ eventType: 'COST_FINALIZED', title: 'Bảng chi phí tháng 10 đã chốt', sourceRecord: null }))
    render(<LiveNotificationsPage viewer={viewer} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Bảng chi phí tháng 10 đã chốt' }))
    expect(await screen.findByText('Nội dung hiện theo quyền hiện hành của bạn.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xem yêu cầu xác nhận' })).toBeNull()
  })
})
