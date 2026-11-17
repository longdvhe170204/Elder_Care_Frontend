import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { BreakdownChart } from './BreakdownChart'
import { chartKind, toneOf } from './chartRules'

// Biểu đồ có chức năng cho Tổng quan, Báo cáo (chủ dự án duyệt 2026-11-17, đề xuất B; DESIGN.md 5.1): chỉ vẽ `breakdown`
// mà api-016 trả; mỗi phần luôn có tên và số (màu không là tín hiệu duy nhất); đỏ chỉ cho việc gấp.

const label = (key) =>
  ({ COMPLETED: 'Hoàn thành', DUE: 'Đến hạn', OVERDUE: 'Quá hạn', T1: 'Tầng 1', T2: 'Tầng 2' })[key] ?? key

describe('chartKind', () => {
  it('các phần cộng đúng bằng tổng thì là thanh chồng; không cộng đủ thì là thanh so sánh; quá nhiều phần thì không vẽ', () => {
    expect(
      chartKind(10, [
        { key: 'A', value: 6 },
        { key: 'B', value: 4 },
      ]),
    ).toBe('stack')
    expect(
      chartKind(10, [
        { key: 'T1', value: 6 },
        { key: 'T2', value: 9 },
      ]),
    ).toBe('bars')
    expect(chartKind(5, [{ key: 'A', value: 5 }])).toBe('none')
    const many = Array.from({ length: 13 }, (_, i) => ({ key: `K${i}`, value: 1 }))
    expect(chartKind(13, many)).toBe('none')
    expect(
      chartKind(0, [
        { key: 'A', value: 0 },
        { key: 'B', value: 0 },
      ]),
    ).toBe('none')
  })
})

describe('toneOf', () => {
  it('đỏ chỉ cho việc gấp; giường dùng màu sơ đồ giường', () => {
    expect(toneOf('OVERDUE', 0)).toBe('var(--destructive)')
    expect(toneOf('COMPLETED', 0)).toBe('var(--success-foreground)')
    expect(toneOf('AWAITING_READY', 0)).toBe('var(--bed-pending)')
    expect(toneOf('HELD_WAITING_RECORD', 0)).toBe('var(--bed-held)')
    expect(toneOf('DUE', 0)).toBe('var(--warning-foreground)')
    expect(toneOf('T1', 0)).not.toBe('var(--destructive)')
  })

  it('Chưa đến hạn, Hoàn thành trễ là tông trung tính (DESIGN.md 3.5), không lẫn với Đến hạn, Hoàn thành', () => {
    expect(toneOf('NOT_YET_DUE', 0)).toBe('var(--muted-foreground)')
    expect(toneOf('COMPLETED_LATE', 0)).toBe('var(--muted-foreground)')
  })
})

describe('BreakdownChart', () => {
  it('thanh chồng: chú thích ghi tên và số của từng phần, có bảng cho trình đọc màn hình', () => {
    render(
      <BreakdownChart
        title="Công việc hôm nay"
        total={10}
        breakdown={[
          { key: 'COMPLETED', value: 6 },
          { key: 'DUE', value: 3 },
          { key: 'OVERDUE', value: 1 },
        ]}
        labelOf={label}
      />,
    )

    const legend = screen.getByRole('list', { name: 'Chú thích Công việc hôm nay' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Hoàn thành 6', 'Đến hạn 3', 'Quá hạn 1'])
    const table = screen.getByRole('table', { name: 'Công việc hôm nay' })
    expect(within(table).getAllByRole('row')).toHaveLength(4)
  })

  it('thanh so sánh: mỗi khóa một hàng kèm số, thanh dài nhất là giá trị lớn nhất', () => {
    render(
      <BreakdownChart
        title="Theo tầng"
        total={10}
        breakdown={[
          { key: 'T1', value: 6 },
          { key: 'T2', value: 9 },
        ]}
        labelOf={label}
      />,
    )

    const rows = screen.getAllByTestId('breakdown-bar')
    expect(rows.map((r) => r.style.width)).toEqual(['66.67%', '100%'])
    // một lần ở hàng nhìn thấy, một lần ở bảng cho trình đọc màn hình
    expect(screen.getAllByText('Tầng 2')).toHaveLength(2)
    expect(within(screen.getByRole('table', { name: 'Theo tầng' })).getByText('9')).toBeTruthy()
  })

  it('không vẽ được thì trả về null để nơi gọi giữ dạng chữ', () => {
    const { container } = render(
      <BreakdownChart title="Một phần" total={5} breakdown={[{ key: 'A', value: 5 }]} labelOf={label} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
