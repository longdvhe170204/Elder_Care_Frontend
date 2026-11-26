import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CareResultForm } from './CareResultForm'

it('FR_034_hoanThanhDonGianDungDongHoServer', () => {
  const submit = vi.fn()
  render(<CareResultForm type="PERFORMED" importance="NORMAL" onSubmit={submit} />)
  expect(screen.getByRole('radio', { name: 'Vừa hoàn thành' })).toBeChecked()
  expect(screen.queryByLabelText('Thời điểm thực hiện')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hoàn thành' }))
  expect(submit).toHaveBeenCalledWith({})
})

it('FR_035_ghiTruocDoBatBuocThoiDiemVaKhongGuiGioCuKhiChonVuaXong', () => {
  const submit = vi.fn()
  render(<CareResultForm type="PERFORMED" importance="NORMAL" onSubmit={submit} />)
  fireEvent.click(screen.getByRole('radio', { name: 'Đã hoàn thành trước đó' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hoàn thành' }))
  expect(submit).not.toHaveBeenCalled()
  expect(screen.getByText('Nhập thời điểm thực tế đã thực hiện.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Thời điểm thực hiện'), { target: { value: '2026-11-26T08:27' } })
  fireEvent.change(screen.getByLabelText('Ghi chú kết quả'), { target: { value: 'Đã hỗ trợ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hoàn thành' }))
  expect(submit).toHaveBeenLastCalledWith({ performedAt: '2026-11-26T08:27:00+07:00', note: 'Đã hỗ trợ' })
  fireEvent.click(screen.getByRole('radio', { name: 'Vừa hoàn thành' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hoàn thành' }))
  expect(submit).toHaveBeenLastCalledWith({ note: 'Đã hỗ trợ' })
})

it('FR_038_doChiSoVanCanGiaTriVaKhongDungFormHoanThanhNhanh', () => {
  const submit = vi.fn()
  render(<CareResultForm type="MEASURED_VALUE" importance="MANDATORY" onSubmit={submit} />)
  expect(screen.queryByRole('radio', { name: 'Vừa hoàn thành' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
  expect(submit).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Giá trị đo'), { target: { value: '36.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
  expect(submit).toHaveBeenCalledWith({ numericValue: 36.5 })
})

it('FR_034_dangLuuKhongNhanThemLenhVaGiuLyDoBatBuoc', () => {
  const submit = vi.fn()
  render(<CareResultForm type="PERFORMED" importance="IMPORTANT" busy onSubmit={submit} />)
  expect(screen.getByLabelText('Lý do hoàn thành trễ (nếu có)')).toBeDisabled()
  expect(screen.getByRole('radio', { name: 'Đã hoàn thành trước đó' })).toBeDisabled()
  const button = screen.getByRole('button', { name: 'Xác nhận hoàn thành' })
  expect(button).toBeDisabled()
  fireEvent.submit(button.closest('form'))
  expect(submit).not.toHaveBeenCalled()
})
