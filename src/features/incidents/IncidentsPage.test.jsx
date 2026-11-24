import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { IncidentsPage } from './IncidentsPage'

// 007 US4 (T037 phần web): danh sách sự cố từ api-007 `GET /incidents`, tên loại từ `/incident-types`, họ tên từ
// api-001; chi tiết có diễn biến, nút lệnh theo `allowedCommands`; ghi diễn biến cần loại và nội dung; đóng cần kết
// quả; ghi nhận sự cố mới cần người cao tuổi, loại, mô tả và lý do khi chọn mức thấp hơn mặc định (FR-042).

let api

const TYPES = [
  {
    id: 31,
    code: 'FALL',
    name: 'Ngã',
    defaultLevel: 'CRITICAL',
    nonHealth: false,
    allowsNoResident: false,
    status: 'ACTIVE',
  },
  {
    id: 32,
    code: 'BEHAVIOR',
    name: 'Kích động',
    defaultLevel: 'MEDIUM',
    nonHealth: false,
    allowsNoResident: false,
    status: 'ACTIVE',
  },
]
const PROGRESSION_TYPES = [
  { id: 51, code: 'CALL_SUPPORT', name: 'Gọi hỗ trợ', group: 'NOTIFICATION', status: 'ACTIVE' },
  { id: 52, code: 'INITIAL_ASSESSMENT', name: 'Đánh giá ban đầu', group: 'EVALUATION', status: 'ACTIVE' },
  {
    id: 53,
    code: 'EMERGENCY_MEDICATION',
    name: 'Dùng thuốc cấp cứu',
    group: 'ACTION',
    resuscitation: true,
    status: 'ACTIVE',
  },
]
const content = (residentId, typeId, level) => ({
  residentId,
  incidentTypeId: typeId,
  discoveredAt: '2026-11-08T02:00:00Z',
  description: 'Ngã trong phòng tắm',
  level,
})
const NEW_INCIDENT = {
  id: 11,
  content: content(9, 31, 'CRITICAL'),
  currentTypeId: 31,
  status: 'NEW',
  level: 'CRITICAL',
  allowedCommands: ['receive', 'progressions', 'change-level'],
  progressions: [],
}
const HANDLING = {
  id: 12,
  content: content(10, 32, 'MEDIUM'),
  currentTypeId: 32,
  status: 'IN_PROGRESS',
  level: 'MEDIUM',
  assignee: 'Trần Thu Hà',
  allowedCommands: ['progressions', 'change-level', 'move-to-monitoring', 'close'],
  progressions: [{ id: 1, progressionTypeId: 51, content: 'Đã gọi điều dưỡng', occurredAt: '2026-11-08T02:10:00Z' }],
}
const CLOSED = { ...HANDLING, id: 13, status: 'CLOSED', allowedCommands: [], resolution: 'Ổn định' }
const VOIDED = { ...HANDLING, id: 14, status: 'VOIDED', allowedCommands: [] }

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/incidents', json(200, [HANDLING, NEW_INCIDENT, CLOSED, VOIDED]))
  api.on('GET', '/incidents/12', json(200, HANDLING))
  api.on('GET', '/incidents/11', json(200, NEW_INCIDENT))
  api.on('GET', '/incident-types', json(200, TYPES))
  api.on('GET', '/progression-types', json(200, PROGRESSION_TYPES))
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
  api.on(
    'GET',
    '/residents',
    json(200, { items: [{ id: 9, profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }] }),
  )
})

afterEach(() => vi.unstubAllGlobals())

// Danh sách là các thẻ <article> (đề xuất 2026-11-24, cùng kiểu dòng cảnh báo), mỗi thẻ một nút mở chi tiết
async function rows() {
  await screen.findByText('Trần Thị Mai')
  return screen.getAllByRole('article')
}

// Báo sự việc (một form thay "Ghi nhận sự cố" và "Tạo cảnh báo"); người không có quyền tạo cảnh báo luôn ghi sự cố
const openReport = () => fireEvent.click(screen.getByRole('button', { name: 'Báo sự việc' }))
const save = () => fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }))

describe('IncidentsPage', () => {
  it('FR_048_suCoKhanCap_hienTheThongTinKhanCap', async () => {
    api.on(
      'GET',
      '/incidents/11/emergency-card',
      json(200, {
        identification: { fullName: 'Trần Thị Mai', roomBed: 'P101-G1' },
        allergies: [{ name: 'Penicillin' }],
        primaryContact: { fullName: 'Trần Văn Nam', phoneNumber: '0900000001' },
      }),
    )
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button'))
    expect(await screen.findByText('Penicillin')).toBeTruthy()
    expect(screen.getByText(/Trần Văn Nam/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '0900000001' })).toHaveAttribute('href', 'tel:0900000001')
  })

  it('FR_045_giaoNguoiXuLy_chonNguoiVaGhiChu', async () => {
    api.on('GET', '/staff', json(200, [{ id: 31, accountId: 41, fullName: 'Trần Thu Hà' }]))
    api.on('GET', '/incidents/11', json(200, { ...NEW_INCIDENT, allowedCommands: ['assign-handler'] }))
    api.on('POST', '/incidents/11/assign-handler', json(200, {}))
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button'))
    fireEvent.click(await screen.findByRole('button', { name: 'Giao người xử lý' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và giao' }))
    expect(await screen.findByText('Chọn người được giao')).toBeTruthy()
    expect(api.calls('POST', '/incidents/11/assign-handler')).toHaveLength(0)
    fireEvent.change(await screen.findByLabelText('Người được giao'), { target: { value: '41' } })
    fireEvent.change(screen.getByLabelText('Ghi chú giao việc'), { target: { value: 'Nhờ chị Hà xử lý' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và giao' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/11/assign-handler')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents/11/assign-handler')[0][1].body)).toEqual({
      assigneeId: 41,
      note: 'Nhờ chị Hà xử lý',
    })
  })

  it('FR_052_ketThucTheoDoiSauNga_chiKhiCoLenh_batBuocLyDo', async () => {
    api.on('GET', '/incidents/11', json(200, { ...NEW_INCIDENT, allowedCommands: ['end-post-fall-monitoring'] }))
    api.on('POST', '/incidents/11/end-post-fall-monitoring', json(200, {}))
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button'))
    // Lệnh ít dùng nằm trong Thêm thao tác ở thanh chân trang
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm thao tác' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kết thúc theo dõi sau ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và kết thúc theo dõi' }))
    expect(await screen.findByText('Nhập lý do kết thúc theo dõi')).toBeTruthy()
    expect(api.calls('POST', '/incidents/11/end-post-fall-monitoring')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Lý do kết thúc theo dõi'), { target: { value: 'Ổn định, tự đi lại' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và kết thúc theo dõi' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/11/end-post-fall-monitoring')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents/11/end-post-fall-monitoring')[0][1].body)).toEqual({
      reason: 'Ổn định, tự đi lại',
    })
  })

  it('FR_050a_chiTietSuCo_coCanhBaoNguyKichMo_hienDongNhacDanSangCanhBao_khongHienKhoiXuLy', async () => {
    api.on(
      'GET',
      '/alerts',
      json(200, [{ id: 20, type: 'CRITICAL_CONDITION', criticalFlagId: 5, status: 'NEW', residentId: 9 }]),
    )
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button'))
    expect(await screen.findByRole('button', { name: 'Xem cảnh báo nguy kịch' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mở xử lý nguy kịch' })).toBeNull()
  })

  // Đề xuất 2026-11-23: sự cố ghi rõ bắt đầu từ yêu cầu hỗ trợ của ai, ai tới lúc nào, ai đến giúp
  it('FR_047i_suCoTuYeuCauHoTro_ghiRoBatDauTuDau', async () => {
    const assist = (id, incidentId) => ({
      id,
      incidentId,
      type: 'STAFF_ASSIST_REQUEST',
      origin: 'ASSIST_BUTTON',
      level: 'CRITICAL',
      status: 'CONVERTED_TO_INCIDENT',
      firstAt: '2026-11-23T10:20:00Z',
      latestAt: '2026-11-23T10:20:00Z',
    })
    api.on('GET', '/alerts', json(200, [assist(70, 11), assist(71, 12)]))
    const detail = {
      pressedBy: 'Vũ Văn Cường',
      assignee: 'Trần Thu Hà',
      arrivedAt: '2026-11-23T10:22:00Z',
      helpers: ['Lê Minh'],
    }
    api.on('GET', '/alerts/70', json(200, { ...assist(70, 11), ...detail }))
    api.on('GET', '/alerts/71', json(200, { ...assist(71, 12), ...detail }))
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button'))
    expect(await screen.findByText(/Bắt đầu từ yêu cầu hỗ trợ của Vũ Văn Cường lúc/)).toBeTruthy()
    expect(screen.getByText(/Trần Thu Hà tới lúc .*; Lê Minh đến giúp\./)).toBeTruthy()
  })

  it('FR_050a_chiTietSuCo_khongCoCanhBaoNguyKich_khongHienGi', async () => {
    api.on('GET', '/alerts', json(200, []))
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button'))
    await screen.findByRole('button', { name: 'Tiếp nhận' })
    expect(screen.queryByRole('button', { name: 'Xem cảnh báo nguy kịch' })).toBeNull()
  })

  it('FR_047k_suCoKhanCap_coLenhCall115_hienNutGoi115_khongCoLenhThiKhongHien', async () => {
    api.on('GET', '/incidents/11', json(200, { ...NEW_INCIDENT, allowedCommands: ['call-115'] }))
    api.on('GET', '/incidents/11/emergency-card', json(200, { identification: { fullName: 'Trần Thị Mai' } }))
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button'))
    // Nút to ở đầu hồ sơ và nút gọi trong khối Gọi 115
    expect((await screen.findAllByRole('button', { name: 'Gọi 115' })).length).toBeGreaterThan(0)
  })

  it('FR_047k_khongCoLenhCall115_khongHienNutGoi115', async () => {
    api.on('GET', '/incidents/11', json(200, { ...NEW_INCIDENT, allowedCommands: ['assign-handler'] }))
    api.on('GET', '/incidents/11/emergency-card', json(200, { identification: { fullName: 'Trần Thị Mai' } }))
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button'))
    await screen.findByRole('button', { name: 'Giao người xử lý' })
    expect(screen.queryByRole('button', { name: 'Gọi 115' })).toBeNull()
  })

  it('FR_052_khongCoLenh_khongHienNutKetThucTheoDoi', async () => {
    api.on('GET', '/incidents/11', json(200, { ...NEW_INCIDENT, allowedCommands: ['assign-handler'] }))
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button'))
    await screen.findByRole('button', { name: 'Giao người xử lý' })
    expect(screen.queryByRole('heading', { name: 'Kết luận' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Kết thúc theo dõi sau ngã' })).toBeNull()
  })

  it('FR_045_dangMo_khanCapLenDau_tenLoaiVaHoTen', async () => {
    render(<IncidentsPage />)
    const list = await rows()
    expect(list).toHaveLength(2)
    expect(within(list[0]).getByText('Trần Thị Mai')).toBeTruthy()
    expect(within(list[0]).getByText('Ngã · Khẩn cấp')).toBeTruthy()
    expect(within(list[0]).getByText('Chưa ai nhận')).toBeTruthy()
    expect(within(list[1]).getByText('Trần Thu Hà xử lý')).toBeTruthy()
  })

  // Đề xuất 2026-11-24: bỏ thanh tiến trình, trạng thái chỉ còn ở nhãn đầu hồ sơ
  it('FR_046_suCoDaDong_hienNhanDaDong_khongConThanhTienTrinh', async () => {
    api.on('GET', '/incidents/13', json(200, CLOSED))
    render(<IncidentsPage incidentId={13} />)
    expect(await screen.findByText('Đã đóng')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Tiến trình' })).toBeNull()
  })

  it('FR_046_nhomDaKetThuc_coDaHuy', async () => {
    render(<IncidentsPage />)
    await rows()
    fireEvent.click(screen.getByRole('button', { name: /^Đã kết thúc/ }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(screen.getByText(/· Đã hủy$/)).toBeTruthy()
  })

  it('FR_045_ghiDienBien_canLoaiVaNoiDung_guiIdempotencyKey', async () => {
    api.on('POST', '/incidents/12/progressions', json(201, {}))
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[1]).getByRole('button', { name: /Lê Văn Bình/ }))
    expect(await screen.findByText(/Đã gọi điều dưỡng/)).toBeTruthy()
    // Ô ghi luôn mở (đề xuất 2026-11-24): nhóm còn thiếu được chọn sẵn, chỉ còn gõ nội dung
    fireEvent.click(screen.getByRole('button', { name: 'Lưu diễn biến' }))
    expect(await screen.findByText('Nhập nội dung')).toBeTruthy()
    expect(api.calls('POST', '/incidents/12/progressions')).toHaveLength(0)
    fireEvent.click(screen.getByRole('radio', { name: /^Gọi, báo tin/ }))
    fireEvent.change(screen.getByLabelText('Nội dung diễn biến'), { target: { value: 'Đã báo bác sĩ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu diễn biến' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/12/progressions')).toHaveLength(1))
    const [, init] = api.calls('POST', '/incidents/12/progressions')[0]
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy()
    expect(JSON.parse(init.body)).toEqual({ progressionTypeId: 51, content: 'Đã báo bác sĩ' })
  })

  it('FR_045_chuyenTheoDoi_noiRoConThieuGi_vaKhoaNutKhiThieu', async () => {
    api.on('GET', '/incidents/12', json(200, { ...HANDLING, progressions: HANDLING.progressions }))
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[1]).getByRole('button', { name: /Lê Văn Bình/ }))
    const toMonitoring = await screen.findByRole('button', { name: 'Chuyển theo dõi' })
    expect(toMonitoring).toBeDisabled()
    expect(toMonitoring.title).toMatch(/Cần thêm diễn biến đánh giá và xử lý/)
    // Nhóm còn thiếu có dấu "còn thiếu" và nhóm đầu tiên còn thiếu được chọn sẵn
    expect(screen.getByRole('radio', { name: /^Đánh giá.*còn thiếu/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /^Xử lý.*còn thiếu/ })).toBeTruthy()
  })

  it('FR_045_ghiDienBien_chiaNhomDeChonNhanh', async () => {
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[1]).getByRole('button', { name: /Lê Văn Bình/ }))
    // Không còn nút "Ghi diễn biến" riêng: ô ghi nằm sẵn trong khối Diễn biến
    expect(await screen.findByRole('radiogroup', { name: 'Loại diễn biến' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ghi diễn biến' })).toBeNull()
    expect(screen.getByRole('radio', { name: /^Đánh giá.*còn thiếu/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Xử lý/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Gọi, báo tin/ })).toBeTruthy()
  })

  it('FR_045_dongSuCo_canKetQua_409HienDieuKien', async () => {
    api.on(
      'POST',
      '/incidents/12/close',
      problem(409, 'CONDITIONS_NOT_MET', {
        unmetConditions: [{ code: 'X', description: 'Chưa có diễn biến đánh giá' }],
      }),
    )
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[1]).getByRole('button', { name: /Lê Văn Bình/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Đóng sự cố' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và đóng sự cố' }))
    expect(await screen.findByText('Nhập kết quả xử lý')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Kết quả xử lý'), { target: { value: 'Ổn định' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và đóng sự cố' }))
    expect(await screen.findByText('Chưa có diễn biến đánh giá')).toBeTruthy()
  })

  it('FR_042_ghiNhan_mucThapHonMacDinh_batBuocLyDo', async () => {
    api.on('POST', '/incidents', json(201, { incident: NEW_INCIDENT }))
    render(<IncidentsPage />)
    await rows()
    openReport()
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trung bình' }))
    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: 'Trượt chân' } })
    save()
    expect(await screen.findByText('Nhập lý do')).toBeTruthy()
    expect(api.calls('POST', '/incidents')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Lý do chọn thấp hơn mức gợi ý'), { target: { value: 'Không chấn thương' } })
    save()
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/incidents')[0][1].body)
    expect(body).toMatchObject({
      residentId: 9,
      incidentTypeId: 31,
      level: 'MEDIUM',
      description: 'Trượt chân',
      lowerLevelReason: 'Không chấn thương',
    })
    expect(body.discoveredAt).toMatch(/\+07:00$/)
  })

  it('BR_M05_17_coSoVatChat_batBuocChonTang', async () => {
    api.on(
      'GET',
      '/incident-types',
      json(200, [
        ...TYPES,
        {
          id: 33,
          code: 'FACILITY',
          name: 'Cơ sở vật chất',
          defaultLevel: 'LOW',
          nonHealth: true,
          allowsNoResident: true,
          status: 'ACTIVE',
        },
      ]),
    )
    api.on('GET', '/incident-floors', json(200, [{ id: 7, name: 'Tầng 1', current: false }]))
    api.on('POST', '/incidents', json(201, { incident: NEW_INCIDENT }))
    render(<IncidentsPage />)
    await rows()
    openReport()
    fireEvent.click(await screen.findByRole('button', { name: 'Việc chung (đồ gửi, cơ sở vật chất)' }))
    expect(screen.queryByRole('button', { name: 'Ngã' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Cơ sở vật chất' }))
    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: 'Hỏng đèn hành lang' } })
    save()
    expect(await screen.findByText('Chọn tầng xảy ra')).toBeTruthy()
    expect(api.calls('POST', '/incidents')).toHaveLength(0)
    fireEvent.change(await screen.findByLabelText('Tầng xảy ra'), { target: { value: '7' } })
    save()
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents')[0][1].body)).toMatchObject({ incidentTypeId: 33, floorAreaId: 7 })
  })

  it('BR_M05_17_tangDangTrucChonSan', async () => {
    api.on(
      'GET',
      '/incident-types',
      json(200, [
        ...TYPES,
        {
          id: 33,
          code: 'FACILITY',
          name: 'Cơ sở vật chất',
          defaultLevel: 'LOW',
          nonHealth: true,
          allowsNoResident: true,
          active: true,
        },
      ]),
    )
    api.on(
      'GET',
      '/incident-floors',
      json(200, [
        { id: 8, name: 'Tầng 2', current: true },
        { id: 7, name: 'Tầng 1', current: false },
      ]),
    )
    api.on('POST', '/incidents', json(201, { incident: NEW_INCIDENT }))
    render(<IncidentsPage />)
    await rows()
    openReport()
    fireEvent.click(await screen.findByRole('button', { name: 'Việc chung (đồ gửi, cơ sở vật chất)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cơ sở vật chất' }))
    await waitFor(() => expect(screen.getByLabelText('Tầng xảy ra').value).toBe('8'))
    fireEvent.click(screen.getByRole('button', { name: 'Hành lang' }))
    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: 'Hỏng đèn gần phòng 201' } })
    save()
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents')[0][1].body)).toMatchObject({
      floorAreaId: 8,
      location: 'Hành lang',
      description: 'Hỏng đèn gần phòng 201',
    })
  })

  it('BR_M05_17_khongXemDuocTang_khoaViecChungNgayBuocDau', async () => {
    api.on(
      'GET',
      '/incident-types',
      json(200, [
        ...TYPES,
        { id: 33, code: 'FACILITY', name: 'Cơ sở vật chất', defaultLevel: 'LOW', allowsNoResident: true, active: true },
      ]),
    )
    api.on('GET', '/incident-floors', json(200, []))
    render(<IncidentsPage />)
    await rows()
    openReport()
    expect(await screen.findByText(/Việc chung phải có tầng/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Việc chung (đồ gửi, cơ sở vật chất)' })).toBeDisabled()
  })

  it('FR_041_daCoSuCoKhanCapDangMo_chiRaSuCoVaChoThamGia', async () => {
    api.on('POST', '/incidents', problem(409, 'OPEN_EMERGENCY_INCIDENT_EXISTS', { incidentId: 11, detail: 'x' }))
    api.on('POST', '/incidents/11/join-handling', json(200, {}))
    render(<IncidentsPage />)
    await rows()
    openReport()
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ngã' }))
    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: 'Ngã lần hai' } })
    save()
    const note = await screen.findByText(/SC-11/, { selector: 'strong' })
    expect(note).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tham gia SC-11' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/11/join-handling')).toHaveLength(1))
  })

  it('FR_041_daCoSuCoKhanCapDangMo_choTaoSuCoRieng', async () => {
    let first = true
    api.on('POST', '/incidents', () => {
      const response = first
        ? problem(409, 'OPEN_EMERGENCY_INCIDENT_EXISTS', { incidentId: 11, detail: 'x' })
        : json(201, { incident: NEW_INCIDENT })
      first = false
      return typeof response === 'function' ? response() : response
    })
    render(<IncidentsPage />)
    await rows()
    openReport()
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ngã' }))
    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: 'Ngã lần hai, phòng khác' } })
    save()
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo sự cố riêng' }))
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(2))
    const [a, b] = api.calls('POST', '/incidents').map(([, init]) => JSON.parse(init.body))
    expect(a.createDespiteOpen).toBeUndefined()
    expect(b).toMatchObject({ residentId: 9, createDespiteOpen: true, description: 'Ngã lần hai, phòng khác' })
    // Lưu xong mở thẳng sự cố vừa ghi, báo ở đầu hồ sơ
    expect(await screen.findByText('Đã ghi sự cố ngã, Trần Thị Mai.')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Chi tiết sự cố' })).toBeTruthy()
  })

  it('FR_040_ghiNhan_chonXongThiGonLai_loaiChiaNhom_mucTuDien', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: 100 + i,
      profileCode: `HS-01${i}`,
      personalInfo: { fullName: `Người số ${i}` },
    }))
    api.on('GET', '/residents', json(200, { items: many }))
    render(<IncidentsPage />)
    await rows()
    openReport()
    expect(await screen.findByLabelText('Tìm người cao tuổi')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Tìm người cao tuổi'), { target: { value: 'số 3' } })
    fireEvent.click(await screen.findByRole('button', { name: /Người số 3/ }))
    expect(screen.getByRole('button', { name: 'Đổi' })).toBeTruthy()
    expect(await screen.findByRole('region', { name: 'Sức khỏe, chăm sóc' })).toBeTruthy()
    expect(screen.queryByText('Gợi ý')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ngã' }))
    expect(screen.getByRole('button', { name: 'Đổi loại' })).toBeTruthy()
    // Mức tự chọn theo mặc định của loại, ô đó có nhãn Gợi ý
    expect(screen.getByText('Gợi ý')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Khẩn cấp' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('nghiepvu_9_3_loaiKhacPhaiTuChonMuc_loaiKhacDienSan', async () => {
    api.on(
      'GET',
      '/incident-types',
      json(200, [
        ...TYPES,
        { id: 40, code: 'OTHER_HEALTH_CARE', name: 'Sức khỏe khác', defaultLevel: 'MEDIUM', active: true },
      ]),
    )
    render(<IncidentsPage />)
    await rows()
    openReport()
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sức khỏe khác' }))
    expect(screen.getByRole('button', { name: 'Trung bình' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: 'Chưa rõ' } })
    save()
    expect(await screen.findByText('Chọn mức')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Đổi loại' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kích động' }))
    expect(screen.getByRole('button', { name: 'Trung bình' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('FR_045_nguoiDangODBenhVien_danhSachHienNhanRieng', async () => {
    api.on(
      'GET',
      '/residents/9',
      json(200, { id: 9, status: 'HOSPITALIZED', profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }),
    )
    render(<IncidentsPage />)
    const list = await rows()
    expect(within(list[0]).getByText('Đang ở bệnh viện')).toBeTruthy()
    expect(within(list[1]).queryByText('Đang ở bệnh viện')).toBeNull()
  })

  it('FR_045b_chuaCoViecTiepTheo_hienNhan_vaGiaoViecCoCanCuSuCo', async () => {
    api.on('GET', '/incidents/12/follow-up-tasks', json(200, []))
    api.on('GET', '/me/permissions', json(200, [{ function: 'TASK_CHECKLIST', operation: 'CREATE' }]))
    api.on('GET', '/task-types', json(200, [{ id: 4, name: 'Theo dõi, quan sát', status: 'ACTIVE' }]))
    api.on('GET', '/staff', json(200, []))
    api.on('POST', '/care-tasks/ad-hoc', json(201, { id: 99 }))
    render(
      <PermissionsProvider>
        <IncidentsPage incidentId={12} />
      </PermissionsProvider>,
    )
    expect(await screen.findByText('Chưa ghi việc tiếp theo')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Giao việc tiếp theo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu việc tiếp theo' }))
    expect(await screen.findByText('Nhập việc cần làm')).toBeTruthy()
    expect(api.calls('POST', '/care-tasks/ad-hoc')).toHaveLength(0)
    await screen.findByRole('option', { name: 'Theo dõi, quan sát' })
    fireEvent.change(screen.getByLabelText('Loại công việc'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Làm lúc'), { target: { value: '2026-11-24T08:00' } })
    fireEvent.change(screen.getByLabelText('Việc cần làm'), { target: { value: 'Đo huyết áp lúc đầu ca' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu việc tiếp theo' }))
    await waitFor(() => expect(api.calls('POST', '/care-tasks/ad-hoc')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/care-tasks/ad-hoc')[0][1].body)).toEqual({
      residentId: 10,
      taskTypeId: 4,
      basis: { type: 'INCIDENT_FOLLOW_UP', id: 12 },
      content: 'Đo huyết áp lúc đầu ca',
      plannedAt: '2026-11-24T08:00:00+07:00',
      importance: 'MANDATORY',
      shared: true,
    })
  })

  it('FR_045b_viecTiepTheo_hienNguoiLam_ketQua_moDungViec_vaNhacKhiDong', async () => {
    const task = {
      id: 88,
      shiftId: 5,
      content: 'Đo huyết áp',
      plannedAt: '2026-11-24T01:00:00Z',
      dueAt: '2026-11-24T02:00:00Z',
      performer: 'Trần Thu Hà',
      status: 'DUE',
    }
    api.on(
      'GET',
      '/incidents/12/follow-up-tasks',
      json(200, [task, { ...task, id: 89, content: 'Xem vết bầm', status: 'COMPLETED', resultNote: 'Không sưng' }]),
    )
    api.on('GET', '/me/permissions', json(200, [{ function: 'TASK_CHECKLIST', operation: 'CONFIRM' }]))
    const onNavigate = vi.fn()
    render(
      <PermissionsProvider>
        <IncidentsPage incidentId={12} onNavigate={onNavigate} />
      </PermissionsProvider>,
    )
    expect(await screen.findByText(/Kết quả: Không sưng/)).toBeTruthy()
    expect(screen.queryByText('Chưa ghi việc tiếp theo')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Mở việc Đo huyết áp' }))
    expect(onNavigate).toHaveBeenCalledWith('care-tasks', { shiftId: 5, taskId: 88 })
    fireEvent.click(screen.getByRole('button', { name: 'Đóng sự cố' }))
    expect((await screen.findByRole('note')).textContent).toMatch(/Còn 1 việc tiếp theo chưa xong/)
  })

  it('FR_040_loaiHayGapLenDau_loaiKhacXuongCuoiSauDongGoiY', async () => {
    api.on(
      'GET',
      '/incident-types',
      json(200, [
        {
          id: 40,
          code: 'OTHER_HEALTH_CARE',
          name: 'Sức khỏe, chăm sóc khác',
          defaultLevel: 'MEDIUM',
          nonHealth: false,
          status: 'ACTIVE',
        },
        { id: 41, code: 'BEHAVIOR', name: 'Kích động', defaultLevel: 'MEDIUM', nonHealth: false, status: 'ACTIVE' },
        { id: 42, code: 'FALL', name: 'Ngã', defaultLevel: 'CRITICAL', nonHealth: false, status: 'ACTIVE' },
      ]),
    )
    render(<IncidentsPage />)
    await rows()
    openReport()
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    const region = await screen.findByRole('region', { name: 'Sức khỏe, chăm sóc' })
    const names = within(region)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(names).toEqual(['Ngã', 'Kích động', 'Sức khỏe, chăm sóc khác'])
    expect(within(region).getByText('Không có loại phù hợp?')).toBeTruthy()
  })

  it('BR_M05_20_bienPhapHoiSucChiHienKhiKhanCap_vaGapLai', async () => {
    render(<IncidentsPage />)
    const list = await rows()
    // Sự cố Trung bình: không có biện pháp hồi sức
    fireEvent.click(within(list[1]).getByRole('button', { name: /Lê Văn Bình/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /^Xử lý/ }))
    expect(screen.queryByRole('button', { name: /Cấp cứu hồi sức/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dùng thuốc cấp cứu' })).toBeNull()
  })

  it('BR_M05_20_suCoKhanCap_bienPhapHoiSucGapSan_bamMoiThay', async () => {
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button', { name: /Trần Thị Mai/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /^Xử lý/ }))
    expect(screen.queryByRole('button', { name: 'Dùng thuốc cấp cứu' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Cấp cứu hồi sức/ }))
    expect(screen.getByRole('button', { name: 'Dùng thuốc cấp cứu' })).toBeTruthy()
  })

  it('FR_040_ghiNhan_chiTietThemKhongBatBuoc_guiNoiXayRaVaXuLyBanDau', async () => {
    api.on('POST', '/incidents', json(201, { incident: NEW_INCIDENT }))
    render(<IncidentsPage />)
    await rows()
    openReport()
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nhà vệ sinh' }))
    expect(screen.getByRole('button', { name: 'Nhà vệ sinh' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Xử lý ban đầu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Giờ phát hiện, xử lý ban đầu/ }))
    fireEvent.change(screen.getByLabelText('Xử lý ban đầu'), { target: { value: 'Đỡ dậy, đo huyết áp' } })
    save()
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    // Ghi chú để trống: mô tả ghép tên loại và nơi xảy ra (backend bắt buộc mô tả)
    expect(JSON.parse(api.calls('POST', '/incidents')[0][1].body)).toMatchObject({
      location: 'Nhà vệ sinh',
      description: 'Ngã, Nhà vệ sinh',
      initialResponse: 'Đỡ dậy, đo huyết áp',
    })
  })

  it('FR_049_nguoiDangODBenhVien_khoaNutChuyenVienVaNoiLyDo', async () => {
    api.on(
      'GET',
      '/incidents/11',
      json(200, { ...NEW_INCIDENT, status: 'IN_PROGRESS', allowedCommands: ['progressions', 'transfer-out'] }),
    )
    api.on(
      'GET',
      '/residents/9',
      json(200, { id: 9, status: 'HOSPITALIZED', profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }),
    )
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button', { name: /Trần Thị Mai/ }))
    expect(await screen.findByText(/Chưa chuyển viện được/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chuyển viện' })).toBeDisabled()
  })

  it('FR_049_nguoiDangLuuTru_choChuyenVien', async () => {
    api.on(
      'GET',
      '/incidents/11',
      json(200, { ...NEW_INCIDENT, status: 'IN_PROGRESS', allowedCommands: ['progressions', 'transfer-out'] }),
    )
    api.on(
      'GET',
      '/residents/9',
      json(200, { id: 9, status: 'IN_RESIDENCE', profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }),
    )
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[0]).getByRole('button', { name: /Trần Thị Mai/ }))
    const button = await screen.findByRole('button', { name: 'Chuyển viện' })
    await waitFor(() => expect(button).not.toBeDisabled())
    expect(screen.queryByText(/Chưa chuyển viện được/)).toBeNull()
  })

  it('FR_049_daChuyenVien_hienDauHieuVaDongTomTat', async () => {
    api.on(
      'GET',
      '/incidents/12',
      json(200, {
        ...HANDLING,
        progressions: [
          {
            id: 9,
            progressionTypeId: 51,
            typeCode: 'TRANSFERRED_OUT',
            content: 'Đã chuyển viện sang Bệnh viện X, người đi kèm: Hà',
            occurredAt: '2026-11-08T03:00:00Z',
          },
        ],
      }),
    )
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[1]).getByRole('button', { name: /Lê Văn Bình/ }))
    expect(await screen.findByText('Đã chuyển viện')).toBeTruthy()
    expect(screen.getAllByText(/Bệnh viện X/).length).toBeGreaterThan(0)
  })

  it('FR_048b_hienAiDaDuocBao_nhanVienVaNguoiThan', async () => {
    api.on(
      'GET',
      '/incidents/12',
      json(200, {
        ...HANDLING,
        notifiedRecipients: [
          { recipient: 'STAFF:1', channel: 'IN_APP', sentAt: '2026-11-08T02:00:00Z', viewedAt: '2026-11-08T02:01:00Z' },
          { recipient: 'STAFF:2', channel: 'IN_APP', sentAt: '2026-11-08T02:00:00Z', viewedAt: null },
          { recipient: 'STAFF:2', channel: 'IN_APP', sentAt: '2026-11-08T02:00:01Z', viewedAt: null },
          { recipient: 'FAMILY_MEMBER:9', channel: 'IN_APP', sentAt: '2026-11-08T02:00:00Z', viewedAt: null },
        ],
      }),
    )
    render(<IncidentsPage />)
    const list = await rows()
    fireEvent.click(within(list[1]).getByRole('button', { name: /Lê Văn Bình/ }))
    // Người được báo nằm trong phần Xem thêm của khối Ghi nhận
    fireEvent.click(await screen.findByRole('button', { name: 'Xem thêm' }))
    const section = await screen.findByRole('region', { name: 'Đã báo cho' })
    expect(section.textContent).toMatch(/Nhân viên: 2 người.*đã xem 1\/2/)
    expect(section.textContent).toMatch(/Người thân: 1 người.*đã xem 0\/1/)
  })

  it('BR_M05_19_nguoiDangODBenhVien_vanGhiDuocNhungCoNhacNho', async () => {
    api.on(
      'GET',
      '/residents',
      json(200, {
        items: [{ id: 9, status: 'HOSPITALIZED', profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }],
      }),
    )
    render(<IncidentsPage />)
    await rows()
    openReport()
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    expect((await screen.findByRole('note')).textContent).toMatch(/đang điều trị tại bệnh viện/)
  })

  it('FR_080_403_khongCoQuyen', async () => {
    api.on('GET', '/incidents', problem(403, 'PERMISSION_DENIED'))
    render(<IncidentsPage />)
    expect(await screen.findByText(/không có quyền/i)).toBeTruthy()
  })
})

// 016 T021 (Q12, chủ dự án duyệt 2026-11-12): mở thẳng một sự cố từ dòng chi tiết báo cáo
it('016_Q12_moTheoIdTuDuongDan', async () => {
  render(<IncidentsPage incidentId={12} />)
  expect(await screen.findByRole('region', { name: 'Chi tiết sự cố' })).toBeInTheDocument()
})
