import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChoiceTray } from './ChoiceTray'

// Ô chọn nhanh (chủ dự án chọn phương án B, 2026-11-21): khay nút ẩn tới khi bấm vào ô, chọn một hoặc nhiều, "Khác" để
// gõ tự do; giá trị là chữ ghép bằng "; " ở trường hiện có (không đổi API). Không chọn sẵn, không xếp hạng (Q-307).

const MOBILITY = ['Đi lại tự lập', 'Đi cần gậy hoặc khung', 'Dùng xe lăn']

function Harness({ initial = '', multiple = true, onChange = () => {} }) {
  const [value, setValue] = useState(initial)
  return (
    <ChoiceTray
      id="mobility"
      label="Vận động"
      options={MOBILITY}
      multiple={multiple}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('ChoiceTray', () => {
  it('khayAnToiKhiBamVaoO_chonNhieuGhepBangChamPhay', () => {
    const changed = vi.fn()
    render(<Harness onChange={changed} />)
    expect(screen.queryByRole('button', { name: 'Dùng xe lăn' })).toBeNull()

    const trigger = screen.getByRole('button', { name: 'Vận động' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Đi cần gậy hoặc khung' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dùng xe lăn' }))

    expect(changed).toHaveBeenLastCalledWith('Đi cần gậy hoặc khung; Dùng xe lăn')
    expect(screen.getByRole('button', { name: 'Bỏ Dùng xe lăn' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dùng xe lăn' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Xong' }))
    expect(screen.queryByRole('button', { name: 'Dùng xe lăn' })).toBeNull()
  })

  it('khac_goTuDoRoiEnter_themVaoGiaTri', () => {
    const changed = vi.fn()
    render(<Harness onChange={changed} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vận động' }))
    fireEvent.click(screen.getByRole('button', { name: 'Khác' }))
    const other = screen.getByRole('textbox', { name: 'Nội dung khác của Vận động' })
    fireEvent.change(other, { target: { value: 'Thích đi dạo buổi sáng' } })
    fireEvent.keyDown(other, { key: 'Enter' })
    expect(changed).toHaveBeenLastCalledWith('Thích đi dạo buổi sáng')
    expect(screen.getByRole('button', { name: 'Bỏ Thích đi dạo buổi sáng' })).toBeInTheDocument()
  })

  it('motLuaChon_chonXongTuDong_vaThayLuaChonCu', () => {
    const changed = vi.fn()
    render(<Harness multiple={false} initial="Đi lại tự lập" onChange={changed} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vận động' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dùng xe lăn' }))
    expect(changed).toHaveBeenLastCalledWith('Dùng xe lăn')
    expect(screen.queryByRole('button', { name: 'Đi cần gậy hoặc khung' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Bỏ Đi lại tự lập' })).toBeNull()
  })

  it('giaTriCu_tachThanhTheVaLuaChon_phanLaVaoKhac', () => {
    render(<Harness initial="Đi cần gậy hoặc khung; Thích đi dạo" />)
    expect(screen.getByRole('button', { name: 'Bỏ Đi cần gậy hoặc khung' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bỏ Thích đi dạo' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vận động' }))
    expect(screen.getByRole('button', { name: 'Đi cần gậy hoặc khung' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Khác' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('esc_dongKhay_boThe_capNhatGiaTri', () => {
    const changed = vi.fn()
    render(<Harness initial="Đi lại tự lập; Dùng xe lăn" onChange={changed} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vận động' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Dùng xe lăn' }), { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Dùng xe lăn' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ Đi lại tự lập' }))
    expect(changed).toHaveBeenLastCalledWith('Dùng xe lăn')
  })
})
