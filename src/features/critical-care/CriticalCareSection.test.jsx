import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { CriticalCareSection } from './CriticalCareSection'

// 007 US11 (FR-050a → FR-050d, BR-M05-15, BR-M05-16, Q-218) và BF-17: khối "Nguy kịch" dùng chung ở hồ sơ người cao tuổi,
// chi tiết sự cố và chi tiết cảnh báo. Bác sĩ (hoặc Điều dưỡng khi không có Bác sĩ trực) ghi dấu ngay cả khi chưa có sự cố;
// có cảnh báo nguy kịch đang mở thì hiện nguyện vọng, xác nhận lại và lựa chọn thực hiện. Sự cố khẩn cấp và cảnh báo nguy
// kịch vẫn là hai bản ghi riêng (FR-041): khối này chỉ đặt cạnh nhau, không gộp, không đổi điều kiện đóng.

let api

const CRITICAL_ALERT = {
  id: 20,
  residentId: 9,
  type: 'CRITICAL_CONDITION',
  level: 'CRITICAL',
  status: 'NEW',
  criticalFlagId: 5,
  incidentId: null,
  allowedCommands: [],
}

function permissions(...keys) {
  api.on(
    'GET',
    '/me/permissions',
    json(
      200,
      keys.map((operation) => ({ function: 'CRITICAL_SIGN', operation })),
    ),
  )
}

function renderSection(props = {}) {
  return render(
    <PermissionsProvider>
      <CriticalCareSection residentId={9} defaultOpen {...props} />
    </PermissionsProvider>,
  )
}

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/staff', json(200, []))
  api.on('GET', '/alerts', json(200, []))
  api.on(
    'GET',
    '/residents/9/end-of-life-wishes',
    json(200, { current: { choice: 'RETURN_HOME', signerType: 'RESIDENT' } }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('CriticalCareSection', () => {
  it('FR_050a_chuaCoCanhBao_baSiCoQuyenTao_hienNutGhiDau_moFormKhiBam', async () => {
    permissions('VIEW', 'CREATE')
    api.on('POST', '/residents/9/critical-flags', json(201, { flagId: 5, alertId: 20 }))
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi dấu nguy kịch' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dấu chính thức' }))
    fireEvent.change(screen.getByLabelText('Nhận định'), { target: { value: 'Suy hô hấp nặng' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ghi dấu nguy kịch' }))
    await waitFor(() => expect(api.calls('POST', '/residents/9/critical-flags')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residents/9/critical-flags')[0][1].body)).toEqual({
      type: 'OFFICIAL',
      assessment: 'Suy hô hấp nặng',
    })
  })

  it('FR_050a_dangMoFormGhiDau_bamQuayLai_dongFormVeNutGhiDau', async () => {
    permissions('VIEW', 'CREATE')
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi dấu nguy kịch' }))
    expect(await screen.findByLabelText('Nhận định')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }))
    expect(await screen.findByRole('button', { name: 'Ghi dấu nguy kịch' })).toBeTruthy()
    expect(screen.queryByLabelText('Nhận định')).toBeNull()
  })

  it('FR_050b_khoiNguyKich_thuGonMacDinh_moRaDongVaoDuoc_nguyenVongLuonHien', async () => {
    permissions('VIEW', 'CREATE', 'UPDATE')
    api.on('GET', '/alerts', json(200, [CRITICAL_ALERT]))
    renderSection({ defaultOpen: false })
    expect(await screen.findByText('Đưa về nhà')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Xác nhận lại nguyện vọng' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mở xử lý nguy kịch' }))
    expect(await screen.findByRole('heading', { name: 'Xác nhận lại nguyện vọng' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn' }))
    expect(screen.queryByRole('heading', { name: 'Xác nhận lại nguyện vọng' })).toBeNull()
    expect(screen.getByText('Đưa về nhà')).toBeTruthy()
  })

  it('FR_050a_khongCoQuyenTaoVaKhongCoCanhBao_khongHienGi', async () => {
    permissions('VIEW')
    const { container } = renderSection()
    await waitFor(() => expect(api.calls('GET', '/alerts').length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: 'Ghi dấu nguy kịch' })).toBeNull()
    expect(container.textContent).toBe('')
  })

  it('FR_050b_coCanhBaoNguyKichDangMo_hienNguyenVong_xacNhanLai_luaChon', async () => {
    permissions('VIEW', 'CREATE', 'UPDATE')
    api.on('GET', '/alerts', json(200, [CRITICAL_ALERT]))
    renderSection()
    expect(await screen.findByText('Đưa về nhà')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Xác nhận lại nguyện vọng' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Thực hiện lựa chọn' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ghi dấu nguy kịch' })).toBeNull()
  })

  it('FR_050a_chiCoQuyenXem_hienNguyenVongNhungKhongCoNutThaoTac', async () => {
    permissions('VIEW')
    api.on('GET', '/alerts', json(200, [CRITICAL_ALERT]))
    renderSection()
    expect(await screen.findByText('Đưa về nhà')).toBeTruthy()
    expect(screen.getByText(/Chỉ xem/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gỡ dấu' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Xác nhận dấu tạm' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Thực hiện lựa chọn' })).toBeNull()
  })

  it('FR_050b_chuaCoNguyenVong_baoChuaCoNguyenVong', async () => {
    permissions('VIEW', 'CREATE')
    api.on('GET', '/alerts', json(200, [CRITICAL_ALERT]))
    api.on('GET', '/residents/9/end-of-life-wishes', json(200, { current: null }))
    renderSection()
    expect(await screen.findByText('Chưa có nguyện vọng cuối đời')).toBeTruthy()
  })

  it('FR_049_canhBaoDaGanSuCo_noiMotLanChuyenVienHaiBenCungXem', async () => {
    permissions('VIEW', 'CREATE')
    api.on('GET', '/alerts', json(200, [{ ...CRITICAL_ALERT, incidentId: 11 }]))
    renderSection({ incidentId: 11 })
    expect(await screen.findByText(/Đã gắn với sự cố SC-11/)).toBeTruthy()
  })

  it('FR_050a_dauConMoSauKhiCanhBaoDaDong_ghiDauBi409_hienGoDauChoBacSi', async () => {
    permissions('VIEW', 'CREATE', 'UPDATE')
    api.on('GET', '/alerts', json(200, [{ ...CRITICAL_ALERT, status: 'CLOSED' }]))
    api.on(
      'POST',
      '/residents/9/critical-flags',
      problem(409, 'CRITICAL_FLAG_EXISTS', { detail: 'Đã có dấu nguy kịch đang mở' }),
    )
    api.on('POST', '/critical-flags/5/remove', json(200, {}))
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi dấu nguy kịch' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dấu chính thức' }))
    fireEvent.change(screen.getByLabelText('Nhận định'), { target: { value: 'Suy hô hấp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ghi dấu nguy kịch' }))
    expect(await screen.findByText(/Dấu nguy kịch đang mở/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Xác nhận dấu tạm' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ dấu' }))
    fireEvent.change(screen.getByLabelText('Lý do gỡ dấu'), { target: { value: 'Đã ổn định' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gỡ dấu' }))
    await waitFor(() => expect(api.calls('POST', '/critical-flags/5/remove')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/critical-flags/5/remove')[0][1].body)).toEqual({ reason: 'Đã ổn định' })
  })

  it('FR_050c_chonGiamNheKhongLyDo_422_baoTaiOLyDoNoiRoKhiNaoBatBuoc', async () => {
    permissions('VIEW', 'CREATE', 'UPDATE')
    api.on('GET', '/alerts', json(200, [CRITICAL_ALERT]))
    api.on(
      'POST',
      '/alerts/20/execute-choice',
      problem(422, 'VALIDATION_FAILED', { detail: 'Lý do bắt buộc, không để trống khoảng trắng' }),
    )
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Ở lại, chăm sóc giảm nhẹ' }))
    fireEvent.click(screen.getByRole('button', { name: 'Thực hiện lựa chọn' }))
    expect(
      await screen.findByText('Nhập lý do: bắt buộc khi không liên lạc được người nào và chưa có nguyện vọng'),
    ).toBeTruthy()
  })

  it('FR_050d_canhBaoNguyKichDaDong_khongLayLamCanhBaoDangMo', async () => {
    permissions('VIEW', 'CREATE')
    api.on('GET', '/alerts', json(200, [{ ...CRITICAL_ALERT, status: 'CLOSED' }]))
    renderSection()
    expect(await screen.findByRole('button', { name: 'Ghi dấu nguy kịch' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Xác nhận lại nguyện vọng' })).toBeNull()
  })
})
