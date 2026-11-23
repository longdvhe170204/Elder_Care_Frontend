import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AlertsPage } from './AlertsPage'

// 007 US3 (T031 phần web): danh sách cảnh báo đọc từ api-007 `GET /alerts`, họ tên từ api-001; nút lệnh theo
// `allowedCommands`; Đóng cần kết quả, Đổi mức cần lý do; lệnh gửi Idempotency-Key; 403 khi tải là không có quyền.

let api

const ALERT_MEDIUM = {
  id: 1,
  residentId: 9,
  type: 'CHI_SO',
  level: 'MEDIUM',
  occurrenceCount: 2,
  firstAt: '2026-11-08T01:00:00Z',
  latestAt: '2026-11-08T01:30:00Z',
  status: 'NEW',
  escalationLevel: 0,
  maxEscalationReached: false,
  acknowledgementDeadline: '2026-11-08T01:45:00Z',
  origin: 'SYSTEM',
  sources: [],
  allowedCommands: ['receive', 'change-level'],
}
const ALERT_CRITICAL = {
  ...ALERT_MEDIUM,
  id: 2,
  residentId: 10,
  type: 'PROLONGED_INSOMNIA',
  level: 'CRITICAL',
  status: 'ESCALATED',
  escalationLevel: 3,
  maxEscalationReached: true,
  allowedCommands: [],
}
const ALERT_IN_PROGRESS = {
  ...ALERT_MEDIUM,
  id: 3,
  status: 'IN_PROGRESS',
  assignee: 'Trần Thu Hà',
  allowedCommands: ['close', 'change-level'],
}
const ALERT_CLOSED = { ...ALERT_MEDIUM, id: 4, status: 'CLOSED', allowedCommands: [] }

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/alerts', json(200, [ALERT_MEDIUM, ALERT_CRITICAL, ALERT_IN_PROGRESS, ALERT_CLOSED]))
  api.on(
    'GET',
    '/residents/9',
    json(200, { id: 9, profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }),
  )
  api.on(
    'GET',
    '/residents/10',
    json(200, { id: 10, profileCode: 'HS-0010', personalInfo: { fullName: 'Lê Văn Bình' } }),
  )
  api.on('GET', '/alerts/3', json(200, ALERT_IN_PROGRESS))
  api.on('GET', '/incident-types', json(200, [{ id: 1, code: 'FALL', name: 'Té ngã' }]))
  api.on('GET', '/alerts/1', json(200, ALERT_MEDIUM))
})

afterEach(() => vi.unstubAllGlobals())

describe('AlertsPage', () => {
  it('FR_050b_chiTietCanhBaoNguyKich_hienKhoiNguyKichVoiNguyenVongVaCacBuoc', async () => {
    const critical = {
      ...ALERT_MEDIUM,
      id: 8,
      type: 'CRITICAL_CONDITION',
      level: 'CRITICAL',
      criticalFlagId: 5,
      incidentId: null,
      allowedCommands: [],
    }
    api.on('GET', '/alerts', json(200, [critical]))
    api.on('GET', '/alerts/8', json(200, critical))
    api.on(
      'GET',
      '/me/permissions',
      json(200, [
        { function: 'CRITICAL_SIGN', operation: 'VIEW' },
        { function: 'CRITICAL_SIGN', operation: 'UPDATE' },
      ]),
    )
    api.on(
      'GET',
      '/residents/9/end-of-life-wishes',
      json(200, { current: { choice: 'RETURN_HOME', signerType: 'RESIDENT' } }),
    )
    render(
      <PermissionsProvider>
        <AlertsPage alertId={8} />
      </PermissionsProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Nguy kịch' })).toBeTruthy()
    expect(await screen.findByText('Đưa về nhà')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Thực hiện lựa chọn' })).toBeTruthy()
  })

  it('FR_027_danhSachDangMo_khanCapVaLeoThangToiDaLenDau_hoTenTuHoSo', async () => {
    render(<AlertsPage role="NURSING_STAFF" />)
    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(within(cards[0]).getByText('Lê Văn Bình')).toBeTruthy()
    expect(within(cards[0]).getByText('Đã leo thang tối đa')).toBeTruthy()
    expect(within(cards[0]).getByText('Mất ngủ kéo dài')).toBeTruthy()
    expect(await within(cards[1]).findByText('Trần Thị Mai')).toBeTruthy()
    expect(within(cards[1]).getByText(/2 lần cùng loại đã gộp/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Tiếp nhận.*Lê Văn Bình/ })).toBeNull()
  })

  // DESIGN.md mục 5, 7.2, 11 ("một tín hiệu cho một điều"): cảnh báo gấp nổi lên bằng dải "Cần làm ngay" và thứ tự,
  // thẻ không cộng viền đỏ; bấm một mục trên dải mở chi tiết cảnh báo đó.
  it('DESIGN_6_7_canhBaoGapLenDaiCanLamNgay_theKhongVienDo', async () => {
    api.on('GET', '/alerts/2', json(200, ALERT_CRITICAL))
    render(<AlertsPage role="NURSING_STAFF" />)
    const strip = await screen.findByRole('region', { name: 'Cần làm ngay' })
    expect(within(strip).getByText('Cần làm ngay (1)')).toBeTruthy()
    const cards = await screen.findAllByRole('article')
    for (const card of cards) expect(card.className).not.toMatch(/ring-destructive/)
    fireEvent.click(await within(strip).findByRole('button', { name: 'Lê Văn Bình, Mất ngủ kéo dài' }))
    await waitFor(() => expect(api.calls('GET', '/alerts/2')).toHaveLength(1))
  })

  it('FR_029_tiepNhanTheoAllowedCommands_guiIdempotencyKey_roiTaiLai', async () => {
    api.on('POST', '/alerts/1/receive', json(200, {}))
    render(<AlertsPage role="NURSING_STAFF" />)
    const receive = await screen.findByRole('button', { name: 'Tiếp nhận cảnh báo của Trần Thị Mai' })
    fireEvent.click(receive)
    await waitFor(() => expect(api.calls('POST', '/alerts/1/receive')).toHaveLength(1))
    const [, init] = api.calls('POST', '/alerts/1/receive')[0]
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy()
    await waitFor(() => expect(api.calls('GET', '/alerts').length).toBeGreaterThan(1))
    expect(await screen.findByText(/Đã tiếp nhận cảnh báo/)).toBeTruthy()
  })

  it('FR_029_dongCanKetQua_doiMucCanLyDo', async () => {
    api.on('POST', '/alerts/3/close', json(200, {}))
    render(<AlertsPage role="NURSING_STAFF" />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Đóng cảnh báo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và đóng cảnh báo' }))
    expect(await screen.findByText('Nhập kết quả xử lý')).toBeTruthy()
    expect(api.calls('POST', '/alerts/3/close')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Kết quả xử lý'), { target: { value: 'Đã đo lại, ổn định' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và đóng cảnh báo' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/3/close')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/alerts/3/close')[0][1].body)).toEqual({ resolution: 'Đã đo lại, ổn định' })
  })

  it('FR_029_doiMuc_xongOLaiChiTiet', async () => {
    api.on('POST', '/alerts/3/change-level', json(200, {}))
    render(<AlertsPage role="NURSING_STAFF" />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    // Lệnh ít dùng nằm trong Thêm thao tác ở thanh chân khung
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm thao tác' }))
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mức' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nhẹ' }))
    fireEvent.change(screen.getByLabelText('Lý do đổi mức'), { target: { value: 'Đã đo lại' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mức mới' }))
    expect(await screen.findByText(/Đã đổi mức sang nhẹ/)).toBeTruthy()
    // Vẫn ở khung chi tiết để làm tiếp, không về danh sách
    expect(screen.getByRole('group', { name: 'Thao tác' })).toBeTruthy()
    expect(JSON.parse(api.calls('POST', '/alerts/3/change-level')[0][1].body)).toEqual({
      newLevel: 'LOW',
      reason: 'Đã đo lại',
    })
  })

  it('FR_027_canhBaoThuCong_hienTenLoaiSuCo', async () => {
    api.on('GET', '/alerts', json(200, [{ ...ALERT_MEDIUM, type: 'FALL', origin: 'MANUAL' }]))
    render(<AlertsPage role="NURSING_STAFF" />)
    expect(await screen.findByText('Té ngã')).toBeTruthy()
  })

  it('FR_029_chuyenSuCo_chonLoaiRoiGui', async () => {
    api.on('GET', '/alerts/3', json(200, { ...ALERT_IN_PROGRESS, allowedCommands: ['convert-to-incident'] }))
    api.on('POST', '/alerts/3/convert-to-incident', json(201, {}))
    render(<AlertsPage role="NURSING_STAFF" />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển thành sự cố' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    expect(await screen.findByText('Chọn loại sự cố')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/3/convert-to-incident')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/alerts/3/convert-to-incident')[0][1].body)).toEqual({ incidentTypeId: 1 })
  })

  it('FR_029_dongCanhBaoKhanCap_canLyDoDaiHon', async () => {
    api.on('GET', '/alerts/3', json(200, { ...ALERT_IN_PROGRESS, level: 'CRITICAL', allowedCommands: ['close'] }))
    api.on('POST', '/alerts/3/close', json(200, {}))
    render(<AlertsPage role="NURSING_STAFF" />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Đóng cảnh báo' }))
    expect(screen.getByRole('note').textContent).toMatch(/Kích hoạt khẩn cấp/)
    fireEvent.change(screen.getByLabelText('Kết quả và lý do không kích hoạt khẩn cấp'), { target: { value: 'ok' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và đóng cảnh báo' }))
    expect(await screen.findByText(/ít nhất 10 ký tự/)).toBeTruthy()
    expect(api.calls('POST', '/alerts/3/close')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Kết quả và lý do không kích hoạt khẩn cấp'), {
      target: { value: 'Đã kiểm tra, người cao tuổi ổn định, không phải khẩn cấp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và đóng cảnh báo' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/3/close')).toHaveLength(1))
  })

  it('FR_029_tiepNhanVaXuLy_motNutHaiLenh', async () => {
    api.on(
      'GET',
      '/alerts',
      json(200, [{ ...ALERT_MEDIUM, allowedCommands: ['receive', 'change-level', 'activate-emergency'] }]),
    )
    api.on('POST', '/alerts/1/receive', json(200, {}))
    api.on('POST', '/alerts/1/start-handling', json(200, {}))
    render(<AlertsPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp nhận và xử lý cảnh báo của Trần Thị Mai' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/1/start-handling')).toHaveLength(1))
    expect(api.calls('POST', '/alerts/1/receive')).toHaveLength(1)
  })

  it('FR_029_chuyenSuCo_hienMaSuCoVaMoSangManSuCo', async () => {
    const onNavigate = vi.fn()
    api.on('GET', '/alerts/3', json(200, { ...ALERT_IN_PROGRESS, allowedCommands: ['convert-to-incident'] }))
    api.on('POST', '/alerts/3/convert-to-incident', json(201, { id: 77 }))
    render(<AlertsPage role="NURSING_STAFF" onNavigate={onNavigate} />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển thành sự cố' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mở sự cố SC-77' }))
    expect(onNavigate).toHaveBeenCalledWith('incidents', { incidentId: 77 })
  })

  it('FR_041_chuyenSuCo_daCoSuCoKhanCap_choGanVaoSuCoDo', async () => {
    const onNavigate = vi.fn()
    api.on('GET', '/alerts/3', json(200, { ...ALERT_IN_PROGRESS, allowedCommands: ['convert-to-incident'] }))
    api.on('POST', '/alerts/3/convert-to-incident', problem(409, 'OPEN_EMERGENCY_INCIDENT_EXISTS', { incidentId: 13 }))
    render(<AlertsPage role="NURSING_STAFF" onNavigate={onNavigate} />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển thành sự cố' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mở sự cố SC-13' }))
    expect(onNavigate).toHaveBeenCalledWith('incidents', { incidentId: 13 })
    api.on('POST', '/alerts/3/convert-to-incident', json(201, { id: 13 }))
    fireEvent.click(screen.getByRole('button', { name: 'Gắn vào sự cố SC-13' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/3/convert-to-incident')).toHaveLength(2))
    expect(JSON.parse(api.calls('POST', '/alerts/3/convert-to-incident')[1][1].body)).toEqual({
      existingIncidentId: 13,
    })
    expect(await screen.findByText(/Đã gắn vào sự cố SC-13/)).toBeTruthy()
  })

  it('FR_029_dangCoSuCoMo_chonCungVu_ganVaoSuCo_khongGuiLoai', async () => {
    api.on('GET', '/alerts/3', json(200, { ...ALERT_IN_PROGRESS, allowedCommands: ['convert-to-incident'] }))
    api.on('GET', '/incidents', json(200, [{ id: 21, status: 'MONITORING', level: 'MEDIUM' }]))
    api.on('POST', '/alerts/3/convert-to-incident', json(201, { id: 21 }))
    render(<AlertsPage role="NURSING_STAFF" />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển thành sự cố' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Cùng vụ: gắn vào SC-21/ }))
    expect(screen.queryByRole('button', { name: 'Té ngã' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Gắn vào SC-21' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/3/convert-to-incident')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/alerts/3/convert-to-incident')[0][1].body)).toEqual({
      existingIncidentId: 21,
    })
  })

  it('FR_041_dangCoSuCoMo_chonVuKhac_guiCreateDespiteOpen', async () => {
    api.on('GET', '/alerts/3', json(200, { ...ALERT_IN_PROGRESS, allowedCommands: ['convert-to-incident'] }))
    api.on('GET', '/incidents', json(200, [{ id: 21, status: 'MONITORING', level: 'CRITICAL' }]))
    api.on('POST', '/alerts/3/convert-to-incident', json(201, { id: 22 }))
    render(<AlertsPage role="NURSING_STAFF" />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển thành sự cố' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    await screen.findByRole('button', { name: /^Cùng vụ/ })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    expect(await screen.findByText('Chọn cùng vụ hay vụ khác')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Vụ khác: tạo sự cố riêng' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/3/convert-to-incident')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/alerts/3/convert-to-incident')[0][1].body)).toEqual({
      incidentTypeId: 1,
      createDespiteOpen: true,
    })
  })

  it('FR_047i_yeuCauChuaBietTenCu_phaiChonNguoiKhiChuyen', async () => {
    const assist = {
      ...ALERT_IN_PROGRESS,
      residentId: null,
      type: 'STAFF_ASSIST_REQUEST',
      origin: 'ASSIST_BUTTON',
      level: 'MEDIUM',
      floorName: 'Tầng 1',
      allowedCommands: ['convert-to-incident'],
    }
    api.on('GET', '/alerts', json(200, [assist]))
    api.on('GET', '/alerts/3', json(200, assist))
    // Tìm trong toàn viện (đề xuất 2026-11-23): gõ tên rồi chọn; nơi xảy ra điền sẵn từ yêu cầu
    api.on(
      'GET',
      '/incident-residents',
      json(200, [{ id: 9, fullName: 'Trần Thị Mai', profileCode: 'HS-0009', roomName: 'P101', floorName: 'Tầng 1' }]),
    )
    api.on('GET', '/incidents', json(200, []))
    api.on('POST', '/alerts/3/convert-to-incident', json(201, { id: 31 }))
    render(<AlertsPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: /^Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển thành sự cố' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    expect(screen.getByLabelText(/Nơi xảy ra/).value).toBe('Tầng 1')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    expect(await screen.findByText('Chọn người cao tuổi của yêu cầu này')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Tìm người cao tuổi theo tên hoặc mã'), { target: { value: 'mai' } })
    fireEvent.click(await screen.findByRole('button', { name: /Trần Thị Mai/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/3/convert-to-incident')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/alerts/3/convert-to-incident')[0][1].body)).toEqual({
      incidentTypeId: 1,
      location: 'Tầng 1',
      residentId: 9,
    })
  })

  it('FR_027_dangXuLyThiKhongConOCanLamNgay', async () => {
    api.on('GET', '/alerts', json(200, [{ ...ALERT_CRITICAL, status: 'IN_PROGRESS', maxEscalationReached: false }]))
    render(<AlertsPage role="NURSING_STAFF" />)
    expect((await screen.findAllByRole('article')).length).toBe(1)
    expect(screen.queryByRole('region', { name: 'Cần làm ngay' })).toBeNull()
  })

  it('FR_027_hienMoTa_vaCacLanBaoSau', async () => {
    api.on(
      'GET',
      '/alerts/3',
      json(200, {
        ...ALERT_IN_PROGRESS,
        description: 'Bà Mai kêu chóng mặt',
        floorName: 'Tầng 2',
        reports: [{ reportedBy: 'Trần Thu Hà', description: 'Chóng mặt lần hai', at: '2026-11-08T01:30:00Z' }],
      }),
    )
    render(<AlertsPage role="NURSING_STAFF" />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    expect(await screen.findByText('Bà Mai kêu chóng mặt')).toBeTruthy()
    const reports = screen.getByRole('region', { name: 'Các lần báo sau' })
    expect(reports.textContent).toMatch(/Trần Thu Hà.*Chóng mặt lần hai/)
  })

  it('FR_045b_canhBaoCongViecQuaHan_moDungDauViec', async () => {
    const overdue = {
      ...ALERT_IN_PROGRESS,
      type: 'OVERDUE_CARE_TASK',
      sources: [{ sourceType: 'M04.TASK', sourceId: 88, level: 'MEDIUM', occurredAt: '2026-11-08T01:00:00Z' }],
    }
    api.on('GET', '/alerts', json(200, [overdue]))
    api.on('GET', '/alerts/3', json(200, overdue))
    api.on('GET', '/me/permissions', json(200, [{ function: 'TASK_CHECKLIST', operation: 'CONFIRM' }]))
    api.on('GET', '/care-tasks/88', json(200, { id: 88, shiftId: 5 }))
    const onNavigate = vi.fn()
    render(
      <PermissionsProvider>
        <AlertsPage onNavigate={onNavigate} />
      </PermissionsProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /^Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mở công việc quá hạn' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('care-tasks', { shiftId: 5, taskId: 88 }))
  })

  it('FR_029_kichHoatKhanCap_chonSanLoaiTheoCanhBao_haiLanBam', async () => {
    const onNavigate = vi.fn()
    const fall = { ...ALERT_MEDIUM, type: 'FALL', origin: 'MANUAL', allowedCommands: ['activate-emergency'] }
    api.on('GET', '/alerts', json(200, [fall]))
    api.on(
      'GET',
      '/alerts/1',
      json(200, { ...ALERT_MEDIUM, type: 'FALL', origin: 'MANUAL', allowedCommands: ['activate-emergency'] }),
    )
    api.on('POST', '/alerts/1/activate-emergency', json(201, { incident: { id: 55 } }))
    render(<AlertsPage role="NURSING_STAFF" onNavigate={onNavigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chi tiết cảnh báo của Trần Thị Mai' }))
    // Cảnh báo không phải Khẩn cấp: Kích hoạt khẩn cấp nằm trong Thêm thao tác
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm thao tác' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kích hoạt khẩn cấp' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu và kích hoạt' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/1/activate-emergency')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/alerts/1/activate-emergency')[0][1].body)).toEqual({ incidentTypeId: 1 })
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('incidents', { incidentId: 55 }))
  })

  it('FR_029_chuyenSuCo_nguoiDangXuLyTiepNhanSuCoLuon', async () => {
    api.on('GET', '/alerts/3', json(200, { ...ALERT_IN_PROGRESS, allowedCommands: ['convert-to-incident'] }))
    api.on('POST', '/alerts/3/convert-to-incident', json(201, { id: 78, allowedCommands: ['receive'] }))
    api.on('POST', '/incidents/78/receive', json(200, {}))
    render(<AlertsPage role="NURSING_STAFF" />)
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[2]).getByRole('button', { name: /Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển thành sự cố' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/78/receive')).toHaveLength(1))
    expect(await screen.findByText(/bạn đang xử lý/)).toBeTruthy()
  })

  it('FR_029_409_hienDieuKienChuaThoa', async () => {
    api.on('POST', '/alerts/1/receive', problem(409, 'ALREADY_RECEIVED'))
    render(<AlertsPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp nhận cảnh báo của Trần Thị Mai' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('FR_080_403_khongCoQuyen', async () => {
    api.on('GET', '/alerts', problem(403, 'PERMISSION_DENIED'))
    render(<AlertsPage role="KITCHEN_STAFF" />)
    expect(await screen.findByText(/không có quyền/i)).toBeTruthy()
  })

  it('FR_029_nhomDaDong', async () => {
    render(<AlertsPage role="NURSING_STAFF" />)
    await screen.findAllByRole('article')
    fireEvent.click(screen.getByRole('button', { name: /^Đã đóng/ }))
    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(1)
    expect(within(cards[0]).getByText('Đã đóng')).toBeTruthy()
  })

  it('006_T078_canhBaoChuaDoiChieu_coNutMoDoiChieuDungNguoi', async () => {
    api.on(
      'GET',
      '/alerts',
      json(200, [{ ...ALERT_MEDIUM, id: 5, type: 'CHUA_DOI_CHIEU', allowedCommands: ['receive'] }, ALERT_CRITICAL]),
    )
    const onNavigate = vi.fn()
    render(<AlertsPage role="NURSING_STAFF" onNavigate={onNavigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mở đối chiếu thuốc của Trần Thị Mai' }))
    // Chỉ mã người cao tuổi đi vào URL, không có họ tên
    expect(onNavigate).toHaveBeenCalledWith('medication', { mode: 'reconciliation', residentId: 9 })
    expect(screen.getAllByRole('button', { name: /Mở đối chiếu thuốc/ })).toHaveLength(1)
  })

  // Đề xuất 2026-11-23 (A duyệt qua Đức Anh): người nhận khác bấm "Tôi đến giúp", người tiếp nhận vẫn lo chính
  it('FR_047i_toiDenGiup_baoDangToiPhu', async () => {
    const assist = {
      ...ALERT_MEDIUM,
      id: 5,
      residentId: null,
      type: 'STAFF_ASSIST_REQUEST',
      origin: 'ASSIST_BUTTON',
      level: 'CRITICAL',
      status: 'RECEIVED',
      assignee: 'Trần Thu Hà',
      floorName: 'Tầng 2',
      allowedCommands: ['join-help'],
    }
    api.on('GET', '/alerts', json(200, [assist]))
    api.on('GET', '/alerts/5', json(200, assist))
    api.on('POST', '/alerts/5/join-help', json(200, {}))
    render(<AlertsPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: /^Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Tôi đến giúp/ }))
    await waitFor(() => expect(api.calls('POST', '/alerts/5/join-help')).toHaveLength(1))
  })

  // Đóng yêu cầu ghi Ngã: nhắc nên ghi sự cố; chuyển thì điền sẵn loại, nơi, mô tả và thêm người đã đến giúp
  it('FR_047i_dongYeuCauNga_nhacGhiSuCo_chuyenThiDienSan', async () => {
    const assist = {
      ...ALERT_IN_PROGRESS,
      id: 6,
      type: 'STAFF_ASSIST_REQUEST',
      origin: 'ASSIST_BUTTON',
      level: 'CRITICAL',
      eventType: 'FALL',
      chosenPlace: 'CORRIDOR',
      placeNote: 'gần phòng 201',
      floorName: 'Tầng 2',
      helpers: ['Lê Minh'],
      allowedCommands: ['close', 'convert-to-incident'],
    }
    api.on('GET', '/alerts', json(200, [assist]))
    api.on('GET', '/alerts/6', json(200, assist))
    api.on('GET', '/incidents', json(200, []))
    api.on('POST', '/alerts/6/convert-to-incident', json(201, { id: 61 }))
    render(<AlertsPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: /^Chi tiết/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Đóng cảnh báo/ }))
    const note = await screen.findByRole('note')
    expect(note.textContent).toMatch(/thường phải ghi sự cố/)
    fireEvent.click(within(note).getByRole('button', { name: 'Chuyển thành sự cố' }))
    expect(await screen.findByLabelText(/Nơi xảy ra/)).toHaveProperty('value', 'Tầng 2, Hành lang, gần phòng 201')
    expect(screen.getByLabelText(/Mô tả/)).toHaveProperty('value', 'Ngã, gần phòng 201')
    expect(screen.getByText('Thêm Lê Minh vào người tham gia xử lý')).toBeTruthy()
    await waitFor(() => expect(api.calls('GET', '/incident-types').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và chuyển sự cố' }))
    await waitFor(() => expect(api.calls('POST', '/alerts/6/convert-to-incident')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/alerts/6/convert-to-incident')[0][1].body)).toEqual({
      incidentTypeId: 1,
      description: 'Ngã, gần phòng 201',
      location: 'Tầng 2, Hành lang, gần phòng 201',
      residentId: undefined,
      addHelpers: true,
    })
  })
})
