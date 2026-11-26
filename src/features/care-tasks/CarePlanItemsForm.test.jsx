import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CarePlanItemsForm } from './CarePlanItemsForm'

const types = [
  { id: 8, name: 'Loại kiểm thử', status: 'ACTIVE', group: 'OTHER', defaultImportance: 'NORMAL' },
  { id: 9, name: 'Hỗ trợ uống nước', status: 'ACTIVE', group: 'DRINKING_ASSISTANCE', defaultImportance: 'IMPORTANT' },
  { id: 10, name: 'Xoay trở', status: 'ACTIVE', group: 'MOVEMENT', defaultImportance: 'MANDATORY', defaultRole: 'CAREGIVER', resultType: 'PERFORMED' },
]
const base = {
  id: 1,
  taskTypeId: 8,
  content: 'Nội dung kiểm thử',
  frequencyType: 'TIMES_PER_DAY',
  timesPerDay: 2,
  times: ['08:00'],
  weekdays: [],
  performerRole: 'CAREGIVER',
  resultType: 'PERFORMED',
  importance: 'NORMAL',
  billable: false,
}

function renderForm(items, save = vi.fn()) {
  render(<CarePlanItemsForm items={items} taskTypes={types} busy={false} onSave={save} />)
  return save
}

it('FR_002_mocGioDangChip_themVaBoChip_guiMangGio', () => {
  const save = renderForm([base])
  expect(screen.getByText('08:00')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Các mốc giờ mục 1'), { target: { value: '14:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc giờ mục 1' }))
  fireEvent.change(screen.getByLabelText('Các mốc giờ mục 1'), { target: { value: '20:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc giờ mục 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Bỏ mốc 20:00 mục 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
  expect(save).toHaveBeenCalledWith([expect.objectContaining({ times: ['08:00', '14:00'] })])
})

it('D14_thieuTruongBatBuoc_baoLoiTiengVietTaiO_khongDungKiemTraCuaTrinhDuyet', () => {
  const save = renderForm([{ ...base, times: [], performerRole: '' }])
  const button = screen.getByRole('button', { name: 'Lưu nháp' })
  expect(button.closest('form')).toHaveAttribute('novalidate')
  fireEvent.click(button)
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByText('Thêm ít nhất một mốc giờ.')).toBeInTheDocument()
  expect(screen.getByText('Chọn vai trò thực hiện.')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Các mốc giờ mục 1'), { target: { value: '08:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc giờ mục 1' }))
  fireEvent.change(screen.getByLabelText('Vai trò thực hiện mục 1'), { target: { value: 'CAREGIVER' } })
  fireEvent.click(button)
  expect(save).toHaveBeenCalledWith([expect.objectContaining({ times: ['08:00'], performerRole: 'CAREGIVER' })])
})

it('Q447_tanSuatChiConHaiLuaChon_soLanTheoSoMocGio', () => {
  const save = renderForm([{ ...base, timesPerDay: 5 }])
  const group = screen.getByRole('radiogroup', { name: 'Tần suất' })
  expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual([
    'Số lần trong ngày',
    'Theo ngày trong tuần',
  ])
  expect(screen.queryByLabelText('Số lần trong ngày mục 1')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Các mốc giờ mục 1'), { target: { value: '14:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc giờ mục 1' }))
  expect(screen.getByText('Làm 2 lần mỗi ngày lúc 08:00, 14:00.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
  expect(save).toHaveBeenCalledWith([
    expect.objectContaining({ frequencyType: 'TIMES_PER_DAY', times: ['08:00', '14:00'], timesPerDay: 2 }),
  ])
})

it('Q447_boKhungTruocSau_hienKhungTheoLoai', () => {
  renderForm([{ ...base, windowBeforeMinutes: 30, windowAfterMinutes: 60 }])
  expect(screen.queryByLabelText('Khung trước mục 1 (phút)')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Khung sau mục 1 (phút)')).not.toBeInTheDocument()
  expect(screen.getByText('Được làm từ 30 phút trước đến 60 phút sau giờ hẹn.')).toBeInTheDocument()
})

it('Q447_tanSuatCu_mocNGio_giuNguyenNeuKhongDoi', () => {
  const save = renderForm([
    { ...base, frequencyType: 'EVERY_N_HOURS', intervalHours: 2, startsAt: '06:00:00', times: [], timesPerDay: null },
  ])
  expect(screen.getByText('Tần suất cũ: Mỗi 2 giờ, bắt đầu 06:00. Chọn tần suất mới nếu muốn đổi.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
  expect(save).toHaveBeenCalledWith([
    expect.objectContaining({ frequencyType: 'EVERY_N_HOURS', intervalHours: 2, startsAt: '06:00:00' }),
  ])
})

it('Q447_khongChonMucQuanTrong_layTheoLoaiCongViec', () => {
  const save = renderForm([base])
  expect(screen.queryByRole('radiogroup', { name: 'Mức quan trọng' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Loại công việc mục 1'), { target: { value: '10' } })
  expect(screen.getByText('Bắt buộc')).toBeInTheDocument()
  expect(screen.getByText('Mức quan trọng theo loại công việc')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
  expect(save).toHaveBeenCalledWith([expect.objectContaining({ taskTypeId: 10, importance: 'MANDATORY' })])
})

it('Figma_nhieuMuc_chiMoMucDangSua_mucKhacThuGon', () => {
  renderForm([base, { ...base, id: 2, taskTypeId: 9, content: 'Mời uống 200 ml', importance: 'IMPORTANT' }])
  expect(screen.getByText('2 mục')).toBeInTheDocument()
  expect(screen.getByLabelText('Loại công việc mục 1')).toBeInTheDocument()
  expect(screen.queryByLabelText('Loại công việc mục 2')).not.toBeInTheDocument()
  const collapsed = screen.getByRole('button', { name: /Mục 2 · Hỗ trợ uống nước/ })
  expect(collapsed).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(collapsed)
  expect(screen.getByLabelText('Loại công việc mục 2')).toBeInTheDocument()
  expect(screen.getByLabelText('Mục tiêu nước mục 2 (ml/ngày)')).toBeInTheDocument()
})

it('Figma_mucTieuNuocChiHienVoiLoaiHoTroUongNuoc', () => {
  renderForm([base])
  expect(screen.queryByLabelText('Mục tiêu nước mục 1 (ml/ngày)')).not.toBeInTheDocument()
})

it('Figma_loiOMucDangThuGon_moMucDoDeThayLoi', () => {
  const save = renderForm([base, { ...base, id: 2, content: '' }])
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByText('Nhập nội dung.')).toBeInTheDocument()
})

it('Q447_mocGioTuBackendCoGiay_hienVaGuiDangHHmm', () => {
  const save = renderForm([{ ...base, times: ['09:00:00', '17:00:00'] }])
  expect(screen.getByText('09:00')).toBeInTheDocument()
  expect(screen.queryByText('09:00:00')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Các mốc giờ mục 1'), { target: { value: '09:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc giờ mục 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
  expect(save).toHaveBeenCalledWith([expect.objectContaining({ times: ['09:00', '17:00'] })])
})

it('Q447_mucCuCoMucKhacLoai_dongBoTheoMucCuaLoaiCongViec', () => {
  // Mục cũ đã chọn Thường trước khi bỏ ô chọn; loại "Xoay trở" trong danh mục là Bắt buộc
  const save = renderForm([{ ...base, taskTypeId: 10, importance: 'NORMAL' }])
  expect(screen.getByText('Bắt buộc')).toBeInTheDocument()
  expect(screen.queryByText('Thường')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
  expect(save).toHaveBeenCalledWith([expect.objectContaining({ taskTypeId: 10, importance: 'MANDATORY' })])
})

it('BF_01_buoc16_mocGioTuMayChuDangGiay_hienGioPhut', () => {
  render(
    <CarePlanItemsForm
      items={[
        {
          id: 1,
          taskTypeId: 8,
          content: 'Nội dung kiểm thử',
          frequencyType: 'TIMES_PER_DAY',
          timesPerDay: 2,
          times: ['08:00:00', '15:00:00'],
          weekdays: [],
          performerRole: 'CAREGIVER',
          resultType: 'PERFORMED',
          importance: 'NORMAL',
          billable: false,
        },
      ]}
      taskTypes={[{ id: 8, name: 'Loại kiểm thử', status: 'ACTIVE', group: 'OTHER' }]}
      busy={false}
      onSave={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: 'Bỏ mốc 08:00 mục 1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Bỏ mốc 15:00 mục 1' })).toBeInTheDocument()
})

it('Q_449_vaiTroThucHien_chiNhanVienChamSocVaDieuDuong', () => {
  render(
    <CarePlanItemsForm
      items={[]}
      taskTypes={[{ id: 8, name: 'Loại kiểm thử', status: 'ACTIVE', group: 'OTHER', defaultRole: 'DOCTOR' }]}
      busy={false}
      onSave={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Thêm mục công việc' }))
  fireEvent.change(screen.getByLabelText('Loại công việc mục 1'), { target: { value: '8' } })
  const role = screen.getByLabelText('Vai trò thực hiện mục 1')
  expect([...role.querySelectorAll('option')].map((o) => o.value).filter(Boolean)).toEqual(['CAREGIVER', 'NURSING_STAFF'])
  expect(role).toHaveValue('')
})
