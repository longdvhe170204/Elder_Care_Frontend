import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AlertsPage } from '@/features/alerts/AlertsPage'

// Trang Cảnh báo mở form "Tạo cảnh báo" (BF-06, FR-026); làm được cả hai thì có dòng "Việc đã xảy ra? Ghi sự cố" đổi sang
// ghi sự cố, rồi chọn Tình trạng (không chọn sẵn). Người chỉ có quyền tạo cảnh báo luôn tạo cảnh báo; loại không phải sức
// khỏe luôn là sự cố. Đã xử lý xong: người có quyền xử lý Lưu và đóng (kèm kết quả), người khác chỉ Lưu.

let api

const CREATED = { id: 31, residentId: 9, type: 'THU_CONG:1', level: 'MEDIUM', occurrenceCount: 1, merged: false }
const TYPES = [
  { id: 1, code: 'FALL', name: 'Té ngã', defaultLevel: 'CRITICAL', nonHealth: false },
  { id: 2, code: 'FACILITY', name: 'Cơ sở vật chất', defaultLevel: 'LOW', nonHealth: true, allowsNoResident: true },
]

function permissions(list) {
  api.on(
    'GET',
    '/me/permissions',
    json(
      200,
      list.map(([fn, operation]) => ({ function: fn, operation })),
    ),
  )
}

const ALERT_ONLY = [
  ['ALERT_HANDLING', 'VIEW'],
  ['ALERT_HANDLING', 'CREATE'],
]
const BOTH = [...ALERT_ONLY, ['INCIDENT_EMERGENCY', 'CREATE']]
const BOTH_CLOSE = [...BOTH, ['INCIDENT_EMERGENCY', 'UPDATE']]

function renderPage(props = {}) {
  return render(
    <PermissionsProvider>
      <AlertsPage {...props} />
    </PermissionsProvider>,
  )
}

async function start() {
  fireEvent.click(await screen.findByRole('button', { name: 'Tạo cảnh báo' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
}

// Làm được cả hai: đổi từ Tạo cảnh báo sang Ghi sự cố bằng dòng nhỏ
async function startIncident() {
  await start()
  fireEvent.click(screen.getByRole('button', { name: 'Việc đã xảy ra? Ghi sự cố' }))
}

const save = () => fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }))

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/alerts', json(200, []))
  api.on('GET', '/incident-types', json(200, TYPES))
  api.on('GET', '/incident-floors', json(200, [{ id: 7, name: 'Tầng 1', current: true }]))
  api.on(
    'GET',
    '/residents',
    json(200, { items: [{ id: 9, profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }] }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('ReportForm', () => {
  it('FR_026_nutTaoCanhBao_chiHienKhiCoQuyenTao', async () => {
    permissions([['ALERT_HANDLING', 'VIEW']])
    renderPage()
    await screen.findByText('Không có cảnh báo đang mở trong phạm vi của bạn.')
    expect(screen.queryByRole('button', { name: 'Tạo cảnh báo' })).toBeNull()
  })

  it('FR_026_chiCoQuyenCanhBao_khongCoDongDoi_guiCanhBao_mucTheoLoaiDoiDuoc', async () => {
    permissions(ALERT_ONLY)
    api.on('POST', '/alerts', json(201, CREATED))
    renderPage()
    await start()
    expect(screen.queryByRole('button', { name: 'Việc đã xảy ra? Ghi sự cố' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Khẩn cấp' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Trung bình' }))
    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: '  Bà An đi loạng choạng  ' } })
    expect(screen.getByText('Cảnh báo · Trung bình')).toBeTruthy()
    save()
    await waitFor(() => expect(api.calls('POST', '/alerts')).toHaveLength(1))
    const [, init] = api.calls('POST', '/alerts')[0]
    expect(JSON.parse(init.body)).toEqual({
      residentId: 9,
      incidentTypeId: 1,
      level: 'MEDIUM',
      description: 'Bà An đi loạng choạng',
    })
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy()
    expect(await screen.findByText('Đã tạo cảnh báo té ngã, Trần Thị Mai.')).toBeTruthy()
  })

  it('ghiChuTrong_moTaLaTenLoai', async () => {
    permissions(ALERT_ONLY)
    api.on('POST', '/alerts', json(201, CREATED))
    renderPage()
    await start()
    save()
    await waitFor(() => expect(api.calls('POST', '/alerts')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/alerts')[0][1].body).description).toBe('Té ngã')
  })

  it('FR_028_cungNguoiCungLoai_baoDaGop', async () => {
    permissions(ALERT_ONLY)
    api.on('POST', '/alerts', json(201, { ...CREATED, merged: true, occurrenceCount: 3 }))
    renderPage()
    await start()
    save()
    expect(await screen.findByText('Đã gộp vào cảnh báo đang mở của Trần Thị Mai, lần thứ 3.')).toBeTruthy()
  })

  it('FR_026_backendTu422_hienLoiTrongForm_khongDong', async () => {
    permissions(ALERT_ONLY)
    api.on('POST', '/alerts', problem(422, 'VALIDATION_FAILED', { detail: 'Loại sự cố không còn dùng' }))
    renderPage()
    await start()
    save()
    expect(await screen.findByText('Loại sự cố không còn dùng')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tạo cảnh báo' })).toBeTruthy()
  })

  it('BF_06_tuTrangCanhBao_macDinhTaoCanhBao_khongHoiTinhTrang', async () => {
    permissions(BOTH)
    api.on('POST', '/alerts', json(201, CREATED))
    renderPage()
    await start()
    expect(screen.getByRole('heading', { name: 'Tạo cảnh báo' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Tình trạng' })).toBeNull()
    expect(screen.getByText('Cảnh báo · Khẩn cấp')).toBeTruthy()
    save()
    await waitFor(() => expect(api.calls('POST', '/alerts')).toHaveLength(1))
    expect(api.calls('POST', '/incidents')).toHaveLength(0)
  })

  it('BF_06_ghiSuCo_phaiChonTinhTrang_khongChonSan_dangXuLyMoKhanCap', async () => {
    permissions(BOTH)
    api.on('POST', '/incidents', json(201, { incident: { id: 55 } }))
    const onNavigate = vi.fn()
    renderPage({ onNavigate })
    await startIncident()
    expect(screen.getByRole('heading', { name: 'Ghi sự cố' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Đang xử lý/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^Đã xử lý xong/ })).toHaveAttribute('aria-pressed', 'false')
    save()
    expect(await screen.findByText('Chọn tình trạng')).toBeTruthy()
    expect(api.calls('POST', '/incidents')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /^Đang xử lý/ }))
    expect(screen.getByText('Sự cố · Khẩn cấp')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và mở khẩn cấp' }))
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/incidents')[0][1].body)
    expect(body).toMatchObject({ residentId: 9, incidentTypeId: 1, level: 'CRITICAL', description: 'Té ngã' })
    expect(body.recordedLater).toBeUndefined()
    expect(api.calls('POST', '/alerts')).toHaveLength(0)
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('incidents', { incidentId: 55 }))
  })

  it('BF_06_dangXuLy_canThemNguoiDenGiup_guiThemCanHoTro', async () => {
    permissions(BOTH)
    api.on('POST', '/incidents', json(201, { incident: { id: 59 } }))
    api.on('POST', '/emergency-assist', json(200, { alertId: 80, contacts: {} }))
    renderPage({ onNavigate: vi.fn() })
    await startIncident()
    fireEvent.click(screen.getByRole('button', { name: /^Đang xử lý/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cần thêm người đến giúp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và mở khẩn cấp' }))
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    await waitFor(() => expect(api.calls('POST', '/emergency-assist')).toHaveLength(1))
  })

  it('BF_06_daXuLyXong_khongCoQuyenDong_chiLuu_phaiNoiDaBaoNguoiNhaChua', async () => {
    permissions(BOTH)
    api.on('POST', '/incidents', json(201, { incident: { id: 56 } }))
    renderPage({ onNavigate: vi.fn() })
    await startIncident()
    fireEvent.click(screen.getByRole('button', { name: /^Đã xử lý xong/ }))
    expect(screen.queryByRole('button', { name: 'Lưu và mở khẩn cấp' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lưu và đóng' })).toBeNull()
    expect(screen.queryByLabelText('Kết quả xử lý')).toBeNull()
    save()
    expect(await screen.findByText('Chọn đã báo người nhà chưa')).toBeTruthy()
    expect(api.calls('POST', '/incidents')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /^Đã báo rồi/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gặp trực tiếp' }))
    save()
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/incidents')[0][1].body)
    expect(body).toMatchObject({ recordedLater: true, familyNotice: { state: 'INFORMED', method: 'IN_PERSON' } })
    expect(body.closeNow).toBeUndefined()
  })

  it('BF_06_daXuLyXong_coQuyenDong_luuVaDong_phaiCoKetQua', async () => {
    permissions(BOTH_CLOSE)
    api.on('POST', '/incidents', json(201, { incident: { id: 57 } }))
    renderPage({ onNavigate: vi.fn() })
    await startIncident()
    fireEvent.click(screen.getByRole('button', { name: /^Đã xử lý xong/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Chưa báo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và đóng' }))
    expect(await screen.findByText('Nhập kết quả xử lý')).toBeTruthy()
    expect(api.calls('POST', '/incidents')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Kết quả xử lý'), { target: { value: '  Đã kiểm tra, không đau  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và đóng' }))
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents')[0][1].body)).toMatchObject({
      recordedLater: true,
      closeNow: true,
      resolution: 'Đã kiểm tra, không đau',
      familyNotice: { state: 'NOT_YET' },
    })
  })

  it('BF_06_loaiKhongPhaiSucKhoe_luonLaSuCo_khongCoDongDoi', async () => {
    permissions(BOTH)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo cảnh báo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cơ sở vật chất' }))
    expect(screen.queryByRole('button', { name: /^Việc (đã xảy ra|chưa xảy ra)/ })).toBeNull()
    expect(screen.getByText('Sự cố · Nhẹ')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Ghi sự cố' })).toBeTruthy()
  })
})
