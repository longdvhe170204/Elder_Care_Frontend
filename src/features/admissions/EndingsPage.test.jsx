import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { EndingsPage } from './EndingsPage'

// 004 T061, T107 (US7; FR-062 → FR-067, BR-M02-12; Q-379): lập hồ sơ kết thúc, danh sách điều kiện (a) → (h) với (h) gồm hai
// ý (quyết toán số dư, tiền cọc và Kế toán đã xác nhận), (e) không có ngoại lệ, ghi nhận bàn giao kèm bản ghi đón, đổi ngày,
// hủy hồ sơ. Bảng hồ sơ lọc theo trạng thái (GET /residency-endings), chọn dòng để mở.

let api

const ENDING = {
  id: 14,
  residentId: 5,
  endCase: 'DISCHARGE',
  expectedEndDate: '2026-11-20',
  status: 'PREPARING',
}

const CONDITIONS = {
  conditions: [
    { code: 'END_A_COSTS', name: 'Chi phí kỳ cuối đã chốt', status: 'NOT_MET', basis: 'FR-063' },
    { code: 'END_E_HANDOVER', name: 'Đã bàn giao người cao tuổi', status: 'NOT_MET', basis: 'FR-063' },
    { code: 'END_F_CONTRACT', name: 'Hợp đồng được xử lý', status: 'AUTOMATIC', basis: 'FR-063' },
    { code: 'END_H_SETTLEMENT', name: 'Số dư và tiền cọc đã quyết toán', status: 'NOT_MET', basis: 'FR-063' },
    {
      code: 'END_H_SETTLEMENT_CONFIRMATION',
      name: 'Kế toán đã xác nhận quyết toán',
      status: 'NOT_MET',
      basis: 'FR-063',
    },
  ],
  warnings: [],
}

// Mọi điều kiện khác đã đạt, chỉ còn (e) bàn giao: nút Xác nhận kết thúc mở
const READY = {
  conditions: CONDITIONS.conditions.map((c) =>
    c.code === 'END_E_HANDOVER' || c.status !== 'NOT_MET' ? c : { ...c, status: 'MET' },
  ),
  warnings: [],
}

function renderPage(role = 'OFFICE_STAFF', onNavigate = vi.fn()) {
  return render(
    <PermissionsProvider>
      <EndingsPage role={role} onNavigate={onNavigate} />
    </PermissionsProvider>,
  )
}

async function openEnding() {
  fireEvent.click(await screen.findByRole('button', { name: 'Nguyễn Thị Lan' }))
  await screen.findByText('Chi phí kỳ cuối đã chốt')
}

beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/me/permissions',
    json(
      200,
      ['VIEW', 'CREATE', 'UPDATE'].map((operation) => ({ function: 'RESIDENCY_END_DEATH', operation })),
    ),
  )
  api.on('GET', '/residency-endings', json(200, [ENDING, { ...ENDING, id: 15, status: 'CANCELLED' }]))
  api.on('GET', '/residency-endings/14', json(200, ENDING))
  api.on('GET', '/residency-endings/14/conditions', json(200, CONDITIONS))
  api.on('GET', '/residents/5', json(200, { id: 5, personalInfo: { fullName: 'Nguyễn Thị Lan' } }))
  api.on(
    'GET',
    '/residents/5/relationships',
    json(200, [
      { id: 1, status: 'ACTIVE', relationship: 'CHILD', familyMember: { id: 41, fullName: 'Trần Văn Minh' } },
    ]),
  )
  api.on('GET', '/staff', json(200, [{ id: 9, fullName: 'Hoàng Thu Hà' }]))
  api.on(
    'GET',
    '/residents',
    json(200, { items: [{ id: 5, profileCode: 'NCT-0005', personalInfo: { fullName: 'Nguyễn Thị Lan' } }] }),
  )
})

describe('EndingsPage', () => {
  it('FR_063_moTheoMa_hienDieuKien_vaHaiYCuaMucH', async () => {
    renderPage()
    await openEnding()

    expect(screen.getByRole('heading', { name: 'Nguyễn Thị Lan' })).toBeInTheDocument()
    expect(screen.getByText('Số dư và tiền cọc đã quyết toán')).toBeInTheDocument()
    expect(screen.getByText('Kế toán đã xác nhận quyết toán')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Điều kiện (h): số dư và tiền cọc đã quyết toán' })).toBeInTheDocument()
    expect(screen.getByText(/Tự động/)).toBeInTheDocument()
  })

  // Demo 2026-11-25: điều kiện dạng bảng; dòng chưa đạt có nút Xử lý mở thẳng màn xử lý của người cao tuổi đó
  it('dieuKienChuaDat_coNutXuLy_moManXuLy', async () => {
    const onNavigate = vi.fn()
    renderPage('OFFICE_STAFF', onNavigate)
    await openEnding()
    const table = screen.getByRole('table', { name: 'Điều kiện kết thúc' })
    const row = (name) => within(table).getByText(name).closest('tr')
    fireEvent.click(within(row('Chi phí kỳ cuối đã chốt')).getByRole('button', { name: /Xử lý/ }))
    expect(onNavigate).toHaveBeenLastCalledWith('charges', {})
    fireEvent.click(within(row('Số dư và tiền cọc đã quyết toán')).getByRole('button', { name: /Xử lý/ }))
    expect(onNavigate).toHaveBeenLastCalledWith('balance', { residentId: 5 })
    expect(within(row('Hợp đồng được xử lý')).queryByRole('button')).toBeNull()
    expect(within(row('Đã bàn giao người cao tuổi')).queryByRole('button', { name: /Xử lý/ })).toBeNull()
  })

  it('FR_063_dieuKien_datMauXanh_chuaDatMauDo_khongHienMaSpec', async () => {
    api.on(
      'GET',
      '/residency-endings/14/conditions',
      json(200, {
        conditions: [
          { code: 'END_B_BELONGINGS', name: 'Không còn đồ gửi cần nhận', status: 'MET', basis: 'FR-063 (b)' },
          {
            code: 'END_E_HANDOVER',
            name: 'Đã ghi nhận bàn giao người cao tuổi',
            status: 'NOT_MET',
            basis: 'Chưa ghi nhận bàn giao người cao tuổi',
          },
          { code: 'END_G_BED', name: 'Giường được giải phóng', status: 'AUTOMATIC', basis: 'FR-063 (g), FR-065' },
        ],
        warnings: [],
      }),
    )
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Nguyễn Thị Lan' }))
    await screen.findByText('Không còn đồ gửi cần nhận')

    expect(screen.getByText('Đạt')).toHaveClass('text-success-foreground')
    expect(screen.getByText('Chưa đạt')).toHaveClass('text-destructive')
    expect(screen.getByText('Chưa ghi nhận bàn giao người cao tuổi')).toBeInTheDocument()
    expect(screen.queryByText(/FR-063/)).not.toBeInTheDocument()
  })

  // Demo 2026-11-25 (chủ dự án chốt): bỏ xin ngoại lệ; nút Xác nhận kết thúc khóa khi còn điều kiện khác (e) chưa đạt
  it('xacNhanKetThuc_khoaKhiConDieuKienKhacChuaDat_khongCoXinNgoaiLe', async () => {
    renderPage()
    await openEnding()
    expect(screen.queryByRole('button', { name: /Xin ngoại lệ/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ghi nhận bàn giao/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác nhận kết thúc' })).toBeDisabled()
    expect(screen.getByText(/Còn 3 điều kiện chưa đạt/)).toBeInTheDocument()
  })

  it('xacNhanKetThuc_ghiBanGiaoChoNguoiThan_roiGuiLenhKetThuc', async () => {
    api.on('GET', '/residency-endings/14/conditions', json(200, READY))
    api.on('POST', '/residency-endings/14/handover', json(201, {}))
    api.on('POST', '/residents/5/end-residency', json(200, {}))
    renderPage()
    await openEnding()
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kết thúc' }))
    expect(screen.queryByRole('button', { name: 'Cơ sở tiếp nhận' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Mã bản ghi đón')).not.toBeInTheDocument()
    fireEvent.change(await screen.findByLabelText('Người thân nhận'), { target: { value: '41' } })
    fireEvent.change(screen.getByLabelText('Thời điểm bàn giao, kết thúc'), { target: { value: '2026-11-20T09:00' } })
    fireEvent.change(await screen.findByLabelText('Nhân viên bàn giao'), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Xuất viện theo hợp đồng' } })
    fireEvent.click(
      within(screen.getByRole('heading', { name: 'Xác nhận kết thúc lưu trú' }).parentElement).getByRole('button', {
        name: 'Xác nhận kết thúc',
      }),
    )

    await waitFor(() => expect(api.calls('POST', '/residents/5/end-residency')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residency-endings/14/handover')[0][1].body)).toEqual({
      recipientType: 'FAMILY_MEMBER',
      familyMemberId: 41,
      handoverAt: '2026-11-20T09:00:00+07:00',
      handoverStaffId: 9,
    })
    expect(JSON.parse(api.calls('POST', '/residents/5/end-residency')[0][1].body)).toEqual({
      reason: 'Xuất viện theo hợp đồng',
      details: { residencyEndingId: 14, effectiveAt: '2026-11-20T09:00:00+07:00' },
    })
  })

  it('xacNhanKetThuc_hanhChinhKhongXemDuocNhanVien_hienTenNguoiGhi', async () => {
    api.on('GET', '/residency-endings/14/conditions', json(200, READY))
    api.on('GET', '/staff', json(200, []))
    api.on(
      'GET',
      '/me',
      json(200, { accountId: 3, type: 'STAFF', fullName: 'Nguyễn Thị Hạnh', roles: ['OFFICE_STAFF'] }),
    )
    renderPage()
    await openEnding()
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kết thúc' }))
    expect(await screen.findByText('Nguyễn Thị Hạnh')).toBeInTheDocument()
    expect(screen.queryByText(/Chính bạn/)).not.toBeInTheDocument()
  })

  // Demo 2026-11-25: người đề nghị gõ tên để tìm, gợi ý người cao tuổi, người thân và nhân viên
  it('FR_062_nguoiDeNghi_goiYTheoTen', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hồ sơ kết thúc' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: 'Nguyễn Thị Lan (NCT-0005)' })
    fireEvent.change(within(dialog).getByLabelText('Người cao tuổi'), { target: { value: '5' } })
    const input = within(dialog).getByLabelText('Người đề nghị')
    const list = document.getElementById(input.getAttribute('list'))
    await waitFor(() =>
      expect([...list.querySelectorAll('option')].map((o) => o.value)).toEqual([
        'Nguyễn Thị Lan (người cao tuổi)',
        'Trần Văn Minh (người thân)',
        'Hoàng Thu Hà (nhân viên)',
      ]),
    )
  })

  it('FR_062_lapHoSo_chuyenCoSoThieuNoiChuyenDen_baoTaiO', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hồ sơ kết thúc' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: 'Nguyễn Thị Lan (NCT-0005)' })
    fireEvent.change(within(dialog).getByLabelText('Người cao tuổi'), { target: { value: '5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chuyển cơ sở' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày kết thúc dự kiến'), { target: { value: '2026-11-30' } })
    fireEvent.change(within(dialog).getByLabelText('Người đề nghị'), { target: { value: 'Con gái' } })
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Gia đình chuyển nơi ở' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lập hồ sơ' }))
    expect(await within(dialog).findByText('Nhập nơi chuyển đến')).toBeInTheDocument()
    expect(api.calls('POST', '/residency-endings')).toHaveLength(0)
  })

  it('FR_067_hoSoDaKetThuc_khongCoNutLenh', async () => {
    api.on('GET', '/residency-endings/14', json(200, { ...ENDING, status: 'COMPLETED' }))
    renderPage()
    await openEnding()
    expect(screen.queryByRole('button', { name: 'Ghi nhận bàn giao…' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xin ngoại lệ…' })).not.toBeInTheDocument()
  })

  it('FR_062_bangHoSo_locTheoTrangThai_kemSoDem', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Hồ sơ kết thúc lưu trú' })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Đã hủy 1' }))
    expect(await screen.findByText('Hồ sơ mã 15')).toBeInTheDocument()
    expect(screen.queryByText('Hồ sơ mã 14')).not.toBeInTheDocument()
  })
})
