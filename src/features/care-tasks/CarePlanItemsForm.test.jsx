import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CarePlanItemsForm } from './CarePlanItemsForm'

it('FR_002_nhapNhieuMocGioGiuDauPhayTrongLucNhapVaGuiMangGio', () => {
  const save = vi.fn()
  render(
    <CarePlanItemsForm
      items={[
        {
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
        },
      ]}
      taskTypes={[{ id: 8, name: 'Loại kiểm thử', status: 'ACTIVE', group: 'OTHER' }]}
      busy={false}
      onSave={save}
    />,
  )
  const field = screen.getByLabelText('Các mốc giờ mục 1 (cách nhau bằng dấu phẩy)')
  fireEvent.change(field, { target: { value: '08:00,' } })
  expect(field).toHaveValue('08:00,')
  fireEvent.change(field, { target: { value: '08:00, 14:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu mục công việc' }))
  expect(save).toHaveBeenCalledWith([expect.objectContaining({ times: ['08:00', '14:00'] })])
  expect(save.mock.calls[0][0][0]).not.toHaveProperty('timesText')
})

it('D14_thieuTruongBatBuoc_baoLoiTiengVietTaiO_khongDungKiemTraCuaTrinhDuyet', () => {
  const save = vi.fn()
  render(
    <CarePlanItemsForm
      items={[
        {
          id: 1,
          taskTypeId: 8,
          content: 'Nội dung kiểm thử',
          frequencyType: 'TIMES_PER_DAY',
          timesPerDay: '',
          times: [],
          weekdays: [],
          performerRole: '',
          resultType: 'PERFORMED',
          importance: 'NORMAL',
          billable: false,
        },
      ]}
      taskTypes={[{ id: 8, name: 'Loại kiểm thử', status: 'ACTIVE', group: 'OTHER' }]}
      busy={false}
      onSave={save}
    />,
  )
  const button = screen.getByRole('button', { name: 'Lưu mục công việc' })
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
