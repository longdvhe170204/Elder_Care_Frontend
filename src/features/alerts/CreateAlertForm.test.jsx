import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AlertsPage } from './AlertsPage'

// 007 FR-026, FR-028, FR-030 (BF-06 bước 1): Trưởng tầng, Bác sĩ, Điều dưỡng tạo cảnh báo thủ công `POST /alerts`:
// người cao tuổi, loại, mức, mô tả bắt buộc; cùng người cùng loại đang mở thì gộp (merged = true).

let api

const CREATED = { id: 31, residentId: 9, type: 'THU_CONG:1', level: 'MEDIUM', occurrenceCount: 1, merged: false }

function permissions(operations) {
  api.on(
    'GET',
    '/me/permissions',
    json(
      200,
      operations.map((operation) => ({ function: 'ALERT_HANDLING', operation })),
    ),
  )
}

function renderPage() {
  return render(
    <PermissionsProvider>
      <AlertsPage />
    </PermissionsProvider>,
  )
}

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/alerts', json(200, []))
  api.on('GET', '/incident-types', json(200, [{ id: 1, code: 'FALL', name: 'Té ngã', defaultLevel: 'CRITICAL' }]))
  api.on(
    'GET',
    '/residents',
    json(200, { items: [{ id: 9, profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }] }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('CreateAlertForm', () => {
  it('FR_026_nutTaoCanhBao_chiHienKhiCoQuyenTaoCanhBao', async () => {
    permissions(['VIEW'])
    renderPage()
    await screen.findByText('Không có cảnh báo đang mở trong phạm vi của bạn.')
    expect(screen.queryByRole('button', { name: 'Tạo cảnh báo' })).toBeNull()
  })

  it('FR_026_taoCanhBao_thieuMoTa_baoLoiTaiO_khongGui', async () => {
    permissions(['VIEW', 'CREATE'])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo cảnh báo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cảnh báo' }))
    expect(await screen.findByText('Nhập mô tả cảnh báo')).toBeTruthy()
    expect(api.calls('POST', '/alerts')).toHaveLength(0)
  })

  it('FR_026_taoCanhBao_guiDuBonTruong_baoDaTao_taiLaiDanhSach', async () => {
    permissions(['VIEW', 'CREATE'])
    api.on('POST', '/alerts', json(201, CREATED))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo cảnh báo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trung bình' }))
    fireEvent.change(screen.getByLabelText('Mô tả cảnh báo'), { target: { value: '  Bà An hay quên uống nước  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cảnh báo' }))
    await waitFor(() => expect(api.calls('POST', '/alerts')).toHaveLength(1))
    const [, init] = api.calls('POST', '/alerts')[0]
    expect(JSON.parse(init.body)).toEqual({
      residentId: 9,
      incidentTypeId: 1,
      level: 'MEDIUM',
      description: 'Bà An hay quên uống nước',
    })
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy()
    expect(await screen.findByText('Đã tạo cảnh báo cho Trần Thị Mai.')).toBeTruthy()
    await waitFor(() => expect(api.calls('GET', '/alerts').length).toBeGreaterThan(1))
  })

  it('FR_026_taoCanhBao_moLaiSauKhiLuu_formTrong_khongGiuNguoiVaLoaiLanTruoc', async () => {
    permissions(['VIEW', 'CREATE'])
    api.on('POST', '/alerts', json(201, CREATED))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo cảnh báo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nhẹ' }))
    fireEvent.change(screen.getByLabelText('Mô tả cảnh báo'), { target: { value: 'Lần một' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cảnh báo' }))
    await screen.findByText('Đã tạo cảnh báo cho Trần Thị Mai.')
    fireEvent.click(screen.getByRole('button', { name: 'Tạo cảnh báo' }))
    expect(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    expect(screen.queryByRole('button', { name: 'Đổi loại' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    expect(screen.getByLabelText('Mô tả cảnh báo').value).toBe('')
  })

  it('FR_028_taoCanhBao_cungNguoiCungLoai_baoDaGopVaoCanhBaoDangMo', async () => {
    permissions(['VIEW', 'CREATE'])
    api.on('POST', '/alerts', json(201, { ...CREATED, merged: true, occurrenceCount: 3 }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo cảnh báo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nhẹ' }))
    fireEvent.change(screen.getByLabelText('Mô tả cảnh báo'), { target: { value: 'Lại quên uống nước' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cảnh báo' }))
    expect(
      await screen.findByText('Đã gộp vào cảnh báo đang mở của Trần Thị Mai, đây là lần thứ 3 cùng loại.'),
    ).toBeTruthy()
  })

  it('FR_026_taoCanhBao_backendTu422_hienLoiTrenSheet_khongDong', async () => {
    permissions(['VIEW', 'CREATE'])
    api.on('POST', '/alerts', problem(422, 'VALIDATION_FAILED', { detail: 'Loại sự cố không còn dùng' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo cảnh báo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Té ngã' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nhẹ' }))
    fireEvent.change(screen.getByLabelText('Mô tả cảnh báo'), { target: { value: 'Thử' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cảnh báo' }))
    expect(await screen.findByText('Loại sự cố không còn dùng')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lưu cảnh báo' })).toBeTruthy()
  })
})
