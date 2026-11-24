import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AlertsPage } from '@/features/alerts/AlertsPage'

// Báo sự việc (đề xuất 2026-11-24, thay "Tạo cảnh báo" và "Ghi nhận sự cố"): "Đã xảy ra" ghi sự cố (BF-06 bước 7,
// FR-040), "Mới là dấu hiệu" tạo cảnh báo thủ công (bước 1, FR-026); người chỉ có quyền tạo cảnh báo luôn tạo cảnh báo;
// loại không phải sức khỏe luôn là sự cố. Mức chọn sẵn theo mặc định của loại. Ghi chú trống thì mô tả là tên loại.

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

function renderPage(props = {}) {
  return render(
    <PermissionsProvider>
      <AlertsPage {...props} />
    </PermissionsProvider>,
  )
}

async function start() {
  fireEvent.click(await screen.findByRole('button', { name: 'Báo sự việc' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
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
  it('FR_026_nutBaoSuViec_chiHienKhiCoQuyenTao', async () => {
    permissions([['ALERT_HANDLING', 'VIEW']])
    renderPage()
    await screen.findByText('Không có cảnh báo đang mở trong phạm vi của bạn.')
    expect(screen.queryByRole('button', { name: 'Báo sự việc' })).toBeNull()
  })

  it('FR_026_chiCoQuyenCanhBao_khongHoiDaXayRa_guiCanhBao_mucTheoLoaiDoiDuoc', async () => {
    permissions(ALERT_ONLY)
    api.on('POST', '/alerts', json(201, CREATED))
    renderPage()
    await start()
    expect(screen.queryByRole('group', { name: 'Ghi thành gì?' })).toBeNull()
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
    expect(screen.getByRole('heading', { name: 'Báo sự việc' })).toBeTruthy()
  })

  it('BF_06_daXayRa_ghiSuCo_moThangSuCo', async () => {
    permissions(BOTH)
    api.on('POST', '/incidents', json(201, { incident: { id: 55 } }))
    const onNavigate = vi.fn()
    renderPage({ onNavigate })
    await start()
    // Mở từ màn Cảnh báo thì chọn sẵn Cảnh báo; bấm Sự cố để ghi sự cố, Khẩn cấp thì nút lưu mở quy trình khẩn cấp
    expect(screen.getByRole('button', { name: /^Cảnh báo/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^Sự cố/ }))
    expect(screen.getByRole('button', { name: /^Sự cố/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Sự cố · Khẩn cấp')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và mở khẩn cấp' }))
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents')[0][1].body)).toMatchObject({
      residentId: 9,
      incidentTypeId: 1,
      level: 'CRITICAL',
      description: 'Té ngã',
    })
    expect(api.calls('POST', '/alerts')).toHaveLength(0)
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('incidents', { incidentId: 55 }))
  })

  it('BF_06_moiLaDauHieu_taoCanhBao', async () => {
    permissions(BOTH)
    api.on('POST', '/alerts', json(201, CREATED))
    renderPage()
    await start()
    fireEvent.click(screen.getByRole('button', { name: /^Cảnh báo/ }))
    expect(screen.getByText('Cảnh báo · Khẩn cấp')).toBeTruthy()
    save()
    await waitFor(() => expect(api.calls('POST', '/alerts')).toHaveLength(1))
    expect(api.calls('POST', '/incidents')).toHaveLength(0)
  })

  it('BF_06_daXuLyXong_ghiNhanSau_phaiNoiDaBaoNguoiNhaChua_roiGuiRecordedLater', async () => {
    permissions(BOTH)
    api.on('POST', '/incidents', json(201, { incident: { id: 56 } }))
    renderPage()
    await start()
    fireEvent.click(screen.getByRole('button', { name: /^Sự cố/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Đã xử lý xong/ }))
    // Ghi nhận sau không còn "mở khẩn cấp"; chưa nói đã báo người nhà chưa thì không gửi
    expect(screen.queryByRole('button', { name: 'Lưu và mở khẩn cấp' })).toBeNull()
    save()
    expect(await screen.findByText('Chọn đã báo người nhà chưa')).toBeTruthy()
    expect(api.calls('POST', '/incidents')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /^Đã báo rồi/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gặp trực tiếp' }))
    save()
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents')[0][1].body)).toMatchObject({
      recordedLater: true,
      familyNotice: { state: 'INFORMED', method: 'IN_PERSON' },
    })
  })

  it('BF_06_ghiNhanSau_chuaBaoNguoiNha_guiNotYet', async () => {
    permissions(BOTH)
    api.on('POST', '/incidents', json(201, { incident: { id: 57 } }))
    renderPage()
    await start()
    fireEvent.click(screen.getByRole('button', { name: /^Sự cố/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Đã xử lý xong/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Chưa báo/ }))
    save()
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents')[0][1].body)).toMatchObject({
      recordedLater: true,
      familyNotice: { state: 'NOT_YET' },
    })
  })

  it('BF_06_dangXuLy_khongGuiRecordedLater', async () => {
    permissions(BOTH)
    api.on('POST', '/incidents', json(201, { incident: { id: 58 } }))
    renderPage()
    await start()
    fireEvent.click(screen.getByRole('button', { name: /^Sự cố/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và mở khẩn cấp' }))
    await waitFor(() => expect(api.calls('POST', '/incidents')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/incidents')[0][1].body)
    expect(body.recordedLater).toBeUndefined()
    expect(body.familyNotice).toBeUndefined()
  })

  it('BF_06_loaiKhongPhaiSucKhoe_luonLaSuCo_khongHoi', async () => {
    permissions(BOTH)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Báo sự việc' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cơ sở vật chất' }))
    expect(screen.queryByRole('group', { name: 'Ghi thành gì?' })).toBeNull()
    expect(screen.getByText('Sự cố · Nhẹ')).toBeTruthy()
  })
})
