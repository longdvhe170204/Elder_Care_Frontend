import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FileInput } from './FileInput'

// Ô chọn tệp dùng chung (chủ dự án yêu cầu 2026-11-17): khung riêng có nút chọn tệp, khác chữ mô tả của ô; vẫn là input
// type="file" thật nên nhãn, bàn phím, trình đọc màn hình như ô nhập khác.
describe('FileInput', () => {
  it('là ô chọn tệp có nhãn, gửi tệp đã chọn và có dấu nhận diện riêng', () => {
    const onChange = vi.fn()
    render(
      <>
        <label htmlFor="scan">Bản scan</label>
        <FileInput id="scan" accept="application/pdf" onChange={onChange} />
      </>,
    )
    const input = screen.getByLabelText('Bản scan')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('data-slot', 'file-input')
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })] } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
