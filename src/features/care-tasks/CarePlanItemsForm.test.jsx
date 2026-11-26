import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
  const save = renderForm([{ ...base, timesPerDay: '', performerRole: '' }])
  const button = screen.getByRole('button', { name: 'Lưu nháp' })
  expect(button.closest('form')).toHaveAttribute('novalidate')
  fireEvent.click(button)
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Số lần trong ngày mục 1')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText('Nhập số lần trong ngày.')).toBeInTheDocument()
  expect(screen.getByText('Chọn vai trò thực hiện.')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Số lần trong ngày mục 1'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Vai trò thực hiện mục 1'), { target: { value: 'CAREGIVER' } })
  fireEvent.click(button)
  expect(save).toHaveBeenCalledWith([expect.objectContaining({ timesPerDay: 2, performerRole: 'CAREGIVER' })])
})

it('Figma_tanSuatDangNutChon_chiHienODungLuaChon', () => {
  renderForm([base])
  expect(screen.getByRole('radio', { name: 'Số lần trong ngày' })).toBeChecked()
  expect(screen.queryByLabelText('Mỗi N giờ mục 1')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'Mỗi N giờ' }))
  expect(screen.getByLabelText('Mỗi N giờ mục 1')).toBeInTheDocument()
  expect(screen.queryByLabelText('Số lần trong ngày mục 1')).not.toBeInTheDocument()
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
