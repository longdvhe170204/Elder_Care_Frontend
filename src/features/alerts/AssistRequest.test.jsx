import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AlertsPage } from './AlertsPage'

// 007 FR-047i, BR-M05-29 (đề xuất 2026-11-23, A duyệt qua Đức Anh): nhân viên gửi yêu cầu hỗ trợ theo tầng xảy ra (chọn sẵn
// tầng đang trực, đổi được, khu vực chung), không cần tên người cao tuổi; khác nút SOS của người cao tuổi. Gửi trước rồi
// bổ sung; tìm người trong toàn viện; nhắc yêu cầu cùng tầng đang mở; người gửi thấy khối "Yêu cầu của bạn".

let api

const SENT = { pressId: 1, alertId: 70, status: 'SENT', receiverName: null }
const body = (method, path, i = 0) => JSON.parse(api.calls(method, path)[i][1].body)

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/alerts', json(200, []))
  api.on('GET', '/incident-types', json(200, []))
  api.on('GET', '/me/permissions', json(200, [{ function: 'EMERGENCY_ASSIST_BUTTON', operation: 'CREATE' }]))
  api.on('GET', '/incident-floors', json(200, [{ id: 7, name: 'Tầng 1', current: true }]))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <PermissionsProvider>
      <AlertsPage />
    </PermissionsProvider>,
  )
}

async function openDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cần hỗ trợ' }))
  return screen.findByRole('dialog')
}

describe('AssistRequest', () => {
  it('FR_047i_guiYeuCau_tangDangTrucChonSan_roiGuiNoi', async () => {
    api.on('POST', '/emergency-assist', json(201, SENT))
    api.on('POST', '/emergency-assist/70/details', json(200, {}))
    renderPage()
    await openDialog()
    const own = await screen.findByRole('button', { name: /Tầng 1/ })
    expect(own.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hành lang' }))
    fireEvent.change(screen.getByLabelText(/Ghi rõ nơi/), { target: { value: ' gần phòng 101 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ngay' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist/70/details')).toHaveLength(1))
    expect(new Headers(api.calls('POST', '/emergency-assist')[0][1].headers).get('Idempotency-Key')).toBeTruthy()
    expect(body('POST', '/emergency-assist')).toEqual({ floorAreaId: 7 })
    expect(body('POST', '/emergency-assist/70/details')).toEqual({
      eventType: 'FALL',
      place: 'CORRIDOR',
      placeNote: 'gần phòng 101',
    })
    expect(await screen.findByText('Đã gửi yêu cầu hỗ trợ.')).toBeTruthy()
  })

  it('FR_047i_tangXayRaKhacTangTruc_baoTheoTangDo', async () => {
    api.on(
      'GET',
      '/incident-floors',
      json(200, [
        { id: 7, name: 'Tầng 1', current: true },
        { id: 8, name: 'Tầng 2' },
      ]),
    )
    api.on('POST', '/emergency-assist', json(201, SENT))
    renderPage()
    await openDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Tầng 2' }))
    expect(screen.getByText(/nhân viên đang trực Tầng 2/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ngay' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist')).toHaveLength(1))
    expect(body('POST', '/emergency-assist')).toEqual({ floorAreaId: 8 })
  })

  it('FR_047i_chonSan_tuChuyenKhuVucChung', async () => {
    api.on('POST', '/emergency-assist', json(201, SENT))
    api.on('POST', '/emergency-assist/70/details', json(200, {}))
    renderPage()
    await openDialog()
    await screen.findByRole('button', { name: /Tầng 1/ })
    fireEvent.click(screen.getByRole('button', { name: 'Sân' }))
    expect(screen.getByRole('button', { name: /Khu vực chung/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/Người phụ trách ca của mọi tầng đang có ca/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ngay' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist')).toHaveLength(1))
    expect(body('POST', '/emergency-assist')).toEqual({ commonArea: true })
  })

  it('FR_047i_khongCoTangTruc_chuaChonThiBaoMoiTang', async () => {
    api.on('GET', '/incident-floors', json(200, [{ id: 7, name: 'Tầng 1' }]))
    api.on('POST', '/emergency-assist', json(201, SENT))
    renderPage()
    await openDialog()
    await screen.findByRole('button', { name: 'Tầng 1' })
    expect(screen.getByText(/Người phụ trách ca của mọi tầng đang có ca/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ngay' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist')).toHaveLength(1))
    expect(api.calls('POST', '/emergency-assist')[0][1].body).toBeUndefined()
  })

  it('FR_047i_khongCoHoSoNhanVien_hienSoGoi', async () => {
    api.on('POST', '/emergency-assist', problem(409, 'NOT_ON_SHIFT', { detail: 'Tài khoản chưa có hồ sơ nhân viên' }))
    renderPage()
    await openDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi ngay' }))
    expect(await screen.findByText('Tài khoản chưa có hồ sơ nhân viên')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Gọi cấp cứu 115/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Gửi ngay' })).toBeTruthy()
  })

  it('FR_047i_guiTruoc_boSungSau', async () => {
    api.on(
      'POST',
      '/emergency-assist',
      json(201, { ...SENT, contacts: { facilityPhone: '0243', emergencyNumber: '115' } }),
    )
    api.on('POST', '/emergency-assist/70/details', json(200, {}))
    renderPage()
    await openDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi ngay' }))
    expect(await screen.findByText('Đã gửi yêu cầu hỗ trợ')).toBeTruthy()
    expect(api.calls('POST', '/emergency-assist/70/details')).toHaveLength(0)
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Gọi viện: 0243/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Gửi bổ sung' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bổ sung' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist/70/details')).toHaveLength(1))
    expect(body('POST', '/emergency-assist/70/details')).toEqual({ eventType: 'FALL' })
    // Mục đã gửi không hiện lại vì mỗi mục chỉ gửi một lần
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ngã' })).toBeNull())
    expect(within(screen.getByRole('dialog')).getByText(/Đã ghi:/).parentElement.textContent).toMatch(/Đã ghi: Ngã\./)
  })

  it('FR_047i_guiXongDoiTang_goiLenhDoiTang', async () => {
    api.on(
      'GET',
      '/incident-floors',
      json(200, [
        { id: 7, name: 'Tầng 1', current: true },
        { id: 8, name: 'Tầng 2' },
      ]),
    )
    api.on('POST', '/emergency-assist', json(201, SENT))
    api.on('POST', '/emergency-assist/70/floor', new Response(null, { status: 204 }))
    renderPage()
    await openDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi ngay' }))
    await screen.findByText('Đã gửi yêu cầu hỗ trợ')
    fireEvent.click(screen.getByRole('button', { name: 'Tầng 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bổ sung' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist/70/floor')).toHaveLength(1))
    expect(body('POST', '/emergency-assist/70/floor')).toEqual({ floorAreaId: 8 })
  })

  it('FR_047i_ngungTim_hienHuongDanGoi115', async () => {
    renderPage()
    await openDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Ngừng tim, ngất' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Gọi 115 ngay/)
  })

  it('FR_047i_goTenTimNguoiCaoTuoi_trongToanVien_goiYTang', async () => {
    api.on(
      'GET',
      '/incident-floors',
      json(200, [
        { id: 7, name: 'Tầng 1', current: true },
        { id: 8, name: 'Tầng 2' },
      ]),
    )
    api.on(
      'GET',
      '/incident-residents',
      json(200, [
        {
          id: 9001,
          fullName: 'Nguyễn Thị An',
          profileCode: 'NCT-9001',
          roomName: 'P201',
          floorAreaId: 8,
          floorName: 'Tầng 2',
        },
      ]),
    )
    api.on('POST', '/emergency-assist', json(201, SENT))
    api.on('POST', '/emergency-assist/70/details', json(200, {}))
    renderPage()
    await openDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Đã biết' }))
    // Chưa gõ thì chưa hiện ai; gõ ít nhất 2 chữ mới tìm
    expect(screen.queryByRole('button', { name: /Nguyễn Thị An/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('Tìm người cao tuổi theo tên hoặc mã'), { target: { value: 'an' } })
    fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Thị An/ }))
    expect(new URL(api.calls('GET', '/incident-residents')[0][0], 'http://x').searchParams.get('q')).toBe('an')
    fireEvent.click(screen.getByRole('button', { name: /báo cho Tầng 2/ }))
    expect(screen.getByRole('button', { name: 'Tầng 2' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/người phụ trách người cao tuổi đã chọn/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ngay' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist/70/details')).toHaveLength(1))
    expect(body('POST', '/emergency-assist')).toEqual({ floorAreaId: 8 })
    expect(body('POST', '/emergency-assist/70/details')).toEqual({ residentId: 9001 })
  })

  it('FR_047i_cungTangDangCoYeuCau_nhacToiDenGiup', async () => {
    api.on(
      'GET',
      '/alerts',
      json(200, [
        {
          id: 55,
          type: 'STAFF_ASSIST_REQUEST',
          origin: 'ASSIST_BUTTON',
          level: 'CRITICAL',
          status: 'NEW',
          floorAreaId: 7,
          floorName: 'Tầng 1',
          firstAt: '2026-11-23T10:20:00Z',
          latestAt: '2026-11-23T10:20:00Z',
          pressedByMe: false,
          allowedCommands: [],
        },
      ]),
    )
    api.on('POST', '/alerts/55/join-help', json(200, {}))
    api.on(
      'GET',
      '/alerts/55',
      json(200, {
        id: 55,
        type: 'STAFF_ASSIST_REQUEST',
        origin: 'ASSIST_BUTTON',
        level: 'CRITICAL',
        status: 'NEW',
        firstAt: '2026-11-23T10:20:00Z',
        latestAt: '2026-11-23T10:20:00Z',
        helpers: ['Bạn'],
        allowedCommands: [],
      }),
    )
    renderPage()
    const dialog = await openDialog()
    expect(await within(dialog).findByText(/Tầng 1 đang có yêu cầu hỗ trợ chưa đóng/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tôi đến giúp' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/55/join-help')).toHaveLength(1))
    expect(api.calls('POST', '/emergency-assist')).toHaveLength(0)
    expect(await screen.findByText('Đã báo bạn đến giúp.')).toBeTruthy()
  })

  it('FR_047j_hienNguoiDangToiVaNguoiDenGiup', async () => {
    api.on(
      'GET',
      '/emergency-assist/current',
      json(200, { ...SENT, status: 'RECEIVED', receiverName: 'Trần Thu Hà', helperNames: ['Lê Minh'] }),
    )
    renderPage()
    expect((await screen.findByRole('region', { name: 'Yêu cầu hỗ trợ của bạn' })).textContent).toMatch(
      /Trần Thu Hà đang tới; Lê Minh đang đến giúp/,
    )
  })

  it('FR_047i_yeuCauDaDong_baoNguoiGuiKetQua', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let open = true
    api.on('GET', '/emergency-assist/current', () => (open ? json(200, SENT) : new Response(null, { status: 204 })))
    api.on(
      'GET',
      '/alerts/70',
      json(200, {
        id: 70,
        type: 'STAFF_ASSIST_REQUEST',
        status: 'CLOSED',
        closedBy: 'Trưởng tầng Lan',
        resolution: 'Cụ chóng mặt, đã nằm nghỉ',
        allowedCommands: [],
      }),
    )
    renderPage()
    await screen.findByRole('region', { name: 'Yêu cầu hỗ trợ của bạn' })
    open = false
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Yêu cầu hỗ trợ của bạn' }).textContent).toMatch(
        /đã được Trưởng tầng Lan đóng: Cụ chóng mặt, đã nằm nghỉ/,
      ),
    )
  })

  it('FR_047i_nguoiGuiMoYeuCau_thayKhoiCuaBan_nhanThem_rut', async () => {
    api.on('GET', '/emergency-assist/current', json(200, SENT))
    api.on(
      'GET',
      '/alerts/70',
      json(200, {
        id: 70,
        type: 'STAFF_ASSIST_REQUEST',
        origin: 'ASSIST_BUTTON',
        level: 'CRITICAL',
        status: 'NEW',
        floorAreaId: 7,
        floorName: 'Tầng 1',
        firstAt: '2026-11-23T10:20:00Z',
        latestAt: '2026-11-23T10:20:00Z',
        pressedByMe: true,
        helpers: ['Lê Minh'],
        allowedCommands: ['assist-details', 'change-floor', 'send-message', 'withdraw'],
      }),
    )
    api.on('POST', '/emergency-assist/70/messages', new Response(null, { status: 204 }))
    api.on('POST', '/emergency-assist/70/withdraw', new Response(null, { status: 204 }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Mở yêu cầu' }))
    const block = await screen.findByRole('region', { name: 'Yêu cầu của bạn' })
    expect(block.textContent).toMatch(/Chưa ai tiếp nhận/)
    expect(block.textContent).toMatch(/Lê Minh đang đến giúp/)
    expect(screen.queryByText('Bạn chỉ xem được cảnh báo này.')).toBeNull()
    fireEvent.click(within(block).getByRole('button', { name: 'Nhắn thêm' }))
    fireEvent.click(within(block).getByRole('button', { name: 'Gửi tin nhắn' }))
    expect(await within(block).findByText('Nhập nội dung nhắn')).toBeTruthy()
    fireEvent.change(within(block).getByLabelText('Nhắn người nhận'), { target: { value: ' Cụ đã tỉnh ' } })
    fireEvent.click(within(block).getByRole('button', { name: 'Gửi tin nhắn' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist/70/messages')).toHaveLength(1))
    expect(body('POST', '/emergency-assist/70/messages')).toEqual({ text: 'Cụ đã tỉnh' })
    fireEvent.click(within(block).getByRole('button', { name: 'Rút yêu cầu' }))
    const confirm = await screen.findByRole('dialog', { name: 'Rút yêu cầu hỗ trợ?' })
    fireEvent.change(within(confirm).getByLabelText(/Lý do/), { target: { value: 'Bấm nhầm' } })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Rút yêu cầu' }))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist/70/withdraw')).toHaveLength(1))
    expect(body('POST', '/emergency-assist/70/withdraw')).toEqual({ reason: 'Bấm nhầm' })
  })

  it('FR_080_khongCoQuyen_khongHienNut', async () => {
    api.on('GET', '/me/permissions', json(200, []))
    renderPage()
    await screen.findByText('Không có cảnh báo đang mở trong phạm vi của bạn.')
    expect(screen.queryByRole('button', { name: 'Cần hỗ trợ' })).toBeNull()
  })
})
