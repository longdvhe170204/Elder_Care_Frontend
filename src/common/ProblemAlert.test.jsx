import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProblemAlert } from './ProblemAlert'

// 000 T099: Alert chung cho lỗi lệnh (DESIGN.md 7.4): 409 kèm điều kiện chưa thỏa, 412 kèm giá trị mới do màn hiển thị.
describe('ProblemAlert', () => {
  it('409_hienDieuKienChuaThoa', () => {
    render(
      <ProblemAlert
        problem={{
          status: 409,
          title: 'Chưa thực hiện được',
          detail: 'Yêu cầu YC-2026-000001 đã được xử lý',
          unmetConditions: [{ code: 'BR-M05-21', description: 'Chỉ Bác sĩ được hủy ghi nhận' }],
        }}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Chưa thực hiện được')
    expect(alert).toHaveTextContent('Yêu cầu YC-2026-000001 đã được xử lý')
    expect(alert).toHaveTextContent('Chỉ Bác sĩ được hủy ghi nhận')
  })

  // Góp ý test BF-12 (2026-11-25): backend gửi cùng một câu ở detail và điều kiện chưa thỏa, khối lỗi lặp câu hai lần
  it('409_dieuKienTrungDetail_khongLapLai', () => {
    const message = 'Phòng có từ hai giường đang dùng: ghi đã hỏi ý kiến người cùng phòng và kết quả'
    render(
      <ProblemAlert
        problem={{
          status: 409,
          title: 'Chưa thực hiện được',
          detail: message,
          unmetConditions: [{ code: 'ROOMMATE_OPINION_REQUIRED', description: message }],
        }}
      />,
    )
    expect(screen.getAllByText(message)).toHaveLength(1)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('412_hienGiaTriMoiDoManTruyen', () => {
    render(
      <ProblemAlert
        problem={{ status: 412, title: 'Dữ liệu đã thay đổi', detail: 'Xem giá trị mới', unmetConditions: [] }}
      >
        <p>Giá trị mới: 72 giờ</p>
      </ProblemAlert>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Giá trị mới: 72 giờ')
  })

  it('khongCoLoi_khongHienGi', () => {
    const { container } = render(<ProblemAlert problem={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
