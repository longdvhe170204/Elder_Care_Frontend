import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ResidentCombobox } from './ResidentCombobox'

// Demo 2026-11-26 (E): chọn người cao tuổi bằng ô tìm theo tên hoặc mã hồ sơ, danh sách hiện ngay khi gõ (thay dropdown
// dài trên toàn hệ thống)

const OPTIONS = [
  { value: '5', label: 'Nguyễn Thị Lan (NCT-2026-000005)' },
  { value: '9', label: 'Phạm Văn Dũng (NCT-2026-009004)' },
  { value: '12', label: 'Đặng Văn Hùng (NCT-2026-009007)' },
]

function Harness({ onChange = () => {} }) {
  const [value, setValue] = useState('')
  return (
    <ResidentCombobox
      id="r"
      label="Người cao tuổi"
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
    />
  )
}

const input = () => screen.getByLabelText('Người cao tuổi')
const type = (text) => fireEvent.change(input(), { target: { value: text } })
const shown = () => screen.queryAllByRole('option').map((o) => o.textContent)

describe('ResidentCombobox', () => {
  it('goTen_khongDau_hoacMaHoSo_hienDanhSachNgay', () => {
    render(<Harness />)
    fireEvent.focus(input())
    expect(shown()).toHaveLength(3)
    type('dung')
    expect(shown()).toEqual(['Phạm Văn Dũng (NCT-2026-009004)'])
    type('009007')
    expect(shown()).toEqual(['Đặng Văn Hùng (NCT-2026-009007)'])
  })

  it('bamMotDong_chonDungMa_hienTenTrongO', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.focus(input())
    type('lan')
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Nguyễn Thị Lan (NCT-2026-000005)' }))
    expect(onChange).toHaveBeenLastCalledWith('5')
    expect(input()).toHaveValue('Nguyễn Thị Lan (NCT-2026-000005)')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('goSuaSauKhiChon_boLuaChon', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.focus(input())
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Nguyễn Thị Lan (NCT-2026-000005)' }))
    type('Nguyễn Thị')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('khongCoKetQua_baoKhongTimThay', () => {
    render(<Harness />)
    fireEvent.focus(input())
    type('xyz')
    expect(screen.getByText('Không tìm thấy người cao tuổi phù hợp.')).toBeInTheDocument()
  })
})
