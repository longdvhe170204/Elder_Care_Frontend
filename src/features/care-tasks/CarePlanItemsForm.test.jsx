import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CarePlanItemsForm } from './CarePlanItemsForm'

const types = [
  { id: 8, name: 'Loại kiểm thử', status: 'ACTIVE', group: 'OTHER' },
  { id: 9, name: 'Hỗ trợ uống nước', status: 'ACTIVE', group: 'DRINKING_ASSISTANCE' },
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
  fireEvent.click(screen.getByRole('radio', { name: 'Bắt buộc' }))
  expect(screen.getByRole('radio', { name: 'Bắt buộc' })).toBeChecked()
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
