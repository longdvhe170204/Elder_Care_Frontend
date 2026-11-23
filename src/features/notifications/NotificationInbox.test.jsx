import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { DetailHost } from '@/test/DetailHost'
import { NotificationInbox } from './NotificationInbox'

// 009 T035: hộp thông báo (FR-033 → FR-036; hợp đồng /me/notifications).

function notification(overrides = {}) {
  return {
    id: 11,
    level: 'MEDIUM',
    eventType: 'TASK_OVERDUE',
    title: 'Công việc quá hạn 30 phút',
    content: [{ informationType: 'GENERAL', content: 'Đo huyết áp lúc 08:00 chưa ghi nhận' }],
    hiddenParts: [],
    identityOnly: false,
    status: 'SENT',
    sentAt: '2026-10-23T01:15:00Z',
    viewedAt: null,
    acknowledgedAt: null,
    acknowledgementMethod: null,
    sourceRecord: { type: 'M05.CARE_TASK', id: '88', canOpen: false },
    canAcknowledgeAndTakeCharge: false,
    ...overrides,
  }
}

const URGENT = notification({ id: 12, level: 'URGENT', title: 'Ngã trong phòng', eventType: 'INCIDENT_URGENT' })
const VIEWED = notification({
  id: 13,
  level: 'LOW',
  title: 'Yêu cầu phê duyệt mới',
  status: 'VIEWED',
  viewedAt: '2026-10-23T01:00:00Z',
})
const PAGE = { unreadCount: 2, unacknowledgedUrgentCount: 1, items: [URGENT, notification(), VIEWED], nextCursor: null }

let api

beforeEach(() => {
  api = mockRoutes()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function inboxCalls() {
  return api.fetchMock.mock.calls
    .map(([url]) => new URL(url, 'http://localhost'))
    .filter((u) => u.pathname === '/api/v1/me/notifications')
}

describe('NotificationInbox', () => {
  // D9 (DESIGN.md mục 8): không hiện mã sự kiện, mã bản ghi nguồn; bộ lọc Loại sự kiện ghi bằng tiêu đề thông báo
  it('D9_khongHienMaSuKien_maBanGhiNguon_boLocTheoTieuDe', async () => {
    api.on('GET', '/me/notifications', json(200, PAGE))
    api.on('GET', '/me/notifications/11', json(200, notification({ status: 'VIEWED' })))
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    await screen.findByRole('button', { name: 'Ngã trong phòng' })

    expect(screen.queryByText('TASK_OVERDUE')).toBeNull()
    expect(screen.queryByText('INCIDENT_URGENT')).toBeNull()
    expect(
      within(screen.getByLabelText('Loại sự kiện')).getByRole('option', { name: 'Công việc quá hạn 30 phút' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Công việc quá hạn 30 phút' }))
    expect(await screen.findByText('Đo huyết áp lúc 08:00 chưa ghi nhận')).toBeInTheDocument()
    expect(screen.queryByText('TASK_OVERDUE')).toBeNull()
    expect(screen.queryByText('M05.CARE_TASK 88')).toBeNull()
  })

  // Hoàn thiện BF-14 (2026-11-23): thông báo đồ gửi mở được (canOpen) thì có nút mở, bấm là sang màn Đồ gửi đúng đồ
  it('FR_034_thongBaoDoGuiMoDuoc_coNutMo_sangManDoGui', async () => {
    const lost = notification({
      id: 21,
      title: 'Đồ gửi thất lạc',
      sourceRecord: { type: 'M12.BELONGING_HANDOVER', id: '23', canOpen: true },
    })
    api.on('GET', '/me/notifications', json(200, { ...PAGE, items: [lost] }))
    api.on('GET', '/me/notifications/21', json(200, { ...lost, status: 'VIEWED' }))
    api.on('GET', '/belongings/handovers/23', json(200, { id: 23, belongingId: 9, residentId: 9005, kind: 'LOSS' }))
    const onNavigate = vi.fn()
    render(<DetailHost>{(host) => <NotificationInbox {...host} onNavigate={onNavigate} />}</DetailHost>)

    fireEvent.click(await screen.findByRole('button', { name: 'Đồ gửi thất lạc' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mở đồ gửi' }))
    await vi.waitFor(() => expect(onNavigate).toHaveBeenCalledWith('belongings', { residentId: 9005, belongingId: 9 }))
  })

  it('FR_034_khongMoDuoc_khongCoNutMo', async () => {
    const lost = notification({
      id: 22,
      title: 'Đồ gửi thất lạc',
      sourceRecord: { type: 'M12.BELONGING_HANDOVER', id: '24', canOpen: false },
    })
    api.on('GET', '/me/notifications', json(200, { ...PAGE, items: [lost] }))
    api.on('GET', '/me/notifications/22', json(200, { ...lost, status: 'VIEWED' }))
    render(<DetailHost>{(host) => <NotificationInbox {...host} onNavigate={vi.fn()} />}</DetailHost>)

    fireEvent.click(await screen.findByRole('button', { name: 'Đồ gửi thất lạc' }))
    expect(await screen.findByText('Đo huyết áp lúc 08:00 chưa ghi nhận')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mở đồ gửi' })).toBeNull()
  })

  // DESIGN.md 9.3 (2.2.2) và 002 T047a: không có SSE (jsdom) thì hỏi lại định kỳ bằng yêu cầu nền; tạm dừng được
  it('tuLamMoi_yeuCauNen_tamDungThiNgung', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    api.on('GET', '/me/notifications', json(200, PAGE))
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    await screen.findByRole('button', { name: 'Ngã trong phòng' })

    act(() => vi.advanceTimersByTime(60_000))
    await vi.waitFor(() => expect(inboxCalls()).toHaveLength(2))
    expect(api.fetchMock.mock.calls.at(-1)[1].headers['X-Background-Refresh']).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng tự làm mới' }))
    expect(screen.getByText(/Đã tạm dừng tự làm mới/)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(180_000))
    expect(inboxCalls()).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục tự làm mới' }))
    await vi.waitFor(() => expect(inboxCalls()).toHaveLength(3))
  })

  it('FR_033_khanCapChuaXacNhanTachLenDau_demChuaXem', async () => {
    api.on('GET', '/me/notifications', json(200, PAGE))
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)

    const urgent = await screen.findByRole('region', { name: 'Khẩn cấp chưa xác nhận' })
    expect(urgent).toHaveTextContent('Ngã trong phòng')
    expect(urgent).toHaveTextContent('Khẩn cấp')
    expect(urgent).toHaveTextContent('Chưa xác nhận')
    const list = screen.getByRole('list', { name: 'Thông báo' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(list).toHaveTextContent('Chưa xem')
    expect(list).toHaveTextContent('Đã xem')
    expect(screen.getByText(/2 chưa xem, 1 khẩn cấp chưa xác nhận/)).toBeInTheDocument()
  })

  it('FR_033_locMucVaChuaXem_guiThamSo', async () => {
    api.on('GET', '/me/notifications', json(200, PAGE))
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    await screen.findByRole('list', { name: 'Thông báo' })

    fireEvent.click(screen.getByRole('button', { name: 'Trung bình' }))
    await screen.findByRole('list', { name: 'Thông báo' })
    expect(inboxCalls().at(-1).searchParams.get('level')).toBe('MEDIUM')

    fireEvent.click(screen.getByRole('button', { name: 'Chưa xem' }))
    await screen.findByRole('list', { name: 'Thông báo' })
    expect(inboxCalls().at(-1).searchParams.get('unread')).toBe('true')
  })

  it('FR_033_locTheoNguoiCaoTuoi_guiResidentId', async () => {
    api.on('GET', '/me/notifications', json(200, PAGE))
    api.on(
      'GET',
      '/residents',
      json(200, {
        items: [
          { id: 501, profileCode: 'NCT-2026-0501', personalInfo: { fullName: 'Nguyễn Văn An' } },
          { id: 502, profileCode: 'NCT-2026-0502', personalInfo: { fullName: 'Trần Thị Bình' } },
        ],
        nextCursor: null,
      }),
    )
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    const select = await screen.findByLabelText('Người cao tuổi')
    expect(within(select).getByRole('option', { name: 'Trần Thị Bình (NCT-2026-0502)' })).toBeInTheDocument()

    fireEvent.change(select, { target: { value: '502' } })
    await screen.findByRole('list', { name: 'Thông báo' })
    expect(inboxCalls().at(-1).searchParams.get('residentId')).toBe('502')

    fireEvent.change(select, { target: { value: '' } })
    await screen.findByRole('list', { name: 'Thông báo' })
    expect(inboxCalls().at(-1).searchParams.has('residentId')).toBe(false)
  })

  it('FR_033_khongXemDuocHoSo_khongCoOLocNguoiCaoTuoi', async () => {
    api.on('GET', '/me/notifications', json(200, PAGE))
    api.on('GET', '/residents', problem(403, 'PERMISSION_DENIED'))
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    await screen.findByRole('list', { name: 'Thông báo' })
    await vi.waitFor(() => expect(api.calls('GET', '/residents')).toHaveLength(1))
    expect(screen.queryByLabelText('Người cao tuổi')).toBeNull()
  })

  it('FR_034_moChiTiet_phanTheoLoai_phanBiAnThanhDongKhoa', async () => {
    api.on('GET', '/me/notifications', json(200, PAGE))
    api.on(
      'GET',
      '/me/notifications/11',
      json(200, notification({ status: 'VIEWED', viewedAt: '2026-10-23T02:00:00Z', hiddenParts: ['HEALTH'] })),
    )
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    fireEvent.click(await screen.findByRole('button', { name: 'Công việc quá hạn 30 phút' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Phần chung' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Đo huyết áp lúc 08:00 chưa ghi nhận')
    expect(dialog).toHaveTextContent('Phần sức khỏe')
    expect(dialog).toHaveTextContent('Bạn không còn quyền xem phần này')
    // D9: không hiện mã bản ghi nguồn
    expect(dialog).not.toHaveTextContent('M05.CARE_TASK 88')
  })

  it('FR_036_anSauKhiXem_boKhoiDanhSach_coIdempotencyKey', async () => {
    api.on('GET', '/me/notifications', json(200, PAGE))
    api.on('GET', '/me/notifications/13', json(200, VIEWED))
    api.on('POST', '/me/notifications/13/hide', json(200, {}))
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    fireEvent.click(await screen.findByRole('button', { name: 'Yêu cầu phê duyệt mới' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ẩn khỏi danh sách' }))

    await screen.findByText('Đã ẩn thông báo khỏi danh sách')
    const [, init] = api.calls('POST', '/me/notifications/13/hide')[0]
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(within(screen.getByRole('list', { name: 'Thông báo' })).queryByText('Yêu cầu phê duyệt mới')).toBeNull()
  })

  it('loiTai_hienThuLai', async () => {
    api.on('GET', '/me/notifications', problem(403, 'PERMISSION_DENIED'))
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    expect(await screen.findByText('Không tải được thông báo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })

  it('FR_026_xacNhanKhanCap_coIdempotencyKey_taiLai', async () => {
    api.on('GET', '/me/notifications', json(200, PAGE))
    api.on('POST', '/notifications/12/acknowledge', json(200, null))
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    const urgent = await screen.findByRole('region', { name: 'Khẩn cấp chưa xác nhận' })

    fireEvent.click(within(urgent).getByRole('button', { name: 'Xác nhận đã nhận' }))
    await screen.findByText('Đã xác nhận thông báo khẩn cấp')
    const [, init] = api.calls('POST', '/notifications/12/acknowledge')[0]
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(inboxCalls().length).toBeGreaterThan(1)
  })

  it('FR_026_daCoNguoiXacNhan_409_baoLyDo', async () => {
    api.on('GET', '/me/notifications', json(200, PAGE))
    api.on('POST', '/notifications/12/acknowledge', problem(409, 'ALREADY_ACKNOWLEDGED', { detail: 'Đã xác nhận' }))
    render(<DetailHost>{(host) => <NotificationInbox {...host} />}</DetailHost>)
    const urgent = await screen.findByRole('region', { name: 'Khẩn cấp chưa xác nhận' })

    fireEvent.click(within(urgent).getByRole('button', { name: 'Xác nhận đã nhận' }))
    expect(await within(urgent).findByText('Chưa thực hiện được')).toBeInTheDocument()
  })
})
