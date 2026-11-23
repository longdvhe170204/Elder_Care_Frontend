import { describe, expect, it } from 'vitest'
import { REQUEST_STATUS } from './admissionLabels'
import { changeSteps, displayStatus } from './changeRequestRules'

// Tiến trình một yêu cầu điều chỉnh hợp đồng (004 BF-08; DESIGN.md 7.2 change-progress): chỉ phản ánh trạng thái đã ghi
// của yêu cầu và phụ lục, không suy ra bước nào chưa có dữ liệu (Q-306, Q-307).

const names = (progress) => progress.steps.map((s) => s.label)
const states = (progress) => progress.steps.map((s) => s.state)

const BASE = {
  status: 'DRAFT',
  minorChange: false,
  representativeConfirmationRequired: true,
}

describe('changeSteps', () => {
  it('Nháp chưa xác nhận người đại diện: bước hiện tại là Xác nhận, 2 trên 5', () => {
    const p = changeSteps(BASE)
    expect(names(p)).toEqual(['Lập yêu cầu', 'Xác nhận người đại diện', 'Duyệt', 'Ký phụ lục', 'Áp dụng'])
    expect(states(p)).toEqual(['done', 'current', 'todo', 'todo', 'todo'])
    expect(p.position).toBe(2)
    expect(p.total).toBe(5)
    expect(p.current.label).toBe('Xác nhận người đại diện')
  })

  it('Nháp đã ghi xác nhận trực tiếp: bước hiện tại là Duyệt', () => {
    const p = changeSteps({ ...BASE, representativeConfirmation: { method: 'PHONE' } })
    expect(states(p)).toEqual(['done', 'done', 'current', 'todo', 'todo'])
    expect(p.current.label).toBe('Duyệt')
  })

  it('Nháp người đại diện đã đồng ý trên ứng dụng: xác nhận đã xong', () => {
    const p = changeSteps({ ...BASE, confirmationRequest: { status: 'ACCEPTED' } })
    expect(states(p)).toEqual(['done', 'done', 'current', 'todo', 'todo'])
  })

  it('Nháp người đại diện không đồng ý hoặc đang chờ: xác nhận vẫn là bước hiện tại', () => {
    expect(changeSteps({ ...BASE, confirmationRequest: { status: 'DECLINED' } }).current.label).toBe(
      'Xác nhận người đại diện',
    )
    expect(changeSteps({ ...BASE, confirmationRequest: { status: 'AWAITING' } }).current.label).toBe(
      'Xác nhận người đại diện',
    )
  })

  it('Chờ duyệt: bước hiện tại là Duyệt, 3 trên 5', () => {
    const p = changeSteps({ ...BASE, status: 'PENDING_APPROVAL', representativeConfirmation: { method: 'PHONE' } })
    expect(states(p)).toEqual(['done', 'done', 'current', 'todo', 'todo'])
    expect(p.position).toBe(3)
  })

  it('Đã duyệt, phụ lục Chờ ký: bước hiện tại là Ký phụ lục, 4 trên 5', () => {
    const p = changeSteps({
      ...BASE,
      status: 'APPROVED',
      representativeConfirmation: { method: 'PHONE' },
      addendum: { status: 'PENDING_SIGNATURE' },
    })
    expect(states(p)).toEqual(['done', 'done', 'done', 'current', 'todo'])
    expect(p.current.label).toBe('Ký phụ lục')
    expect(p.position).toBe(4)
  })

  it('Đã duyệt, phụ lục Chờ hiệu lực: ký đã xong, bước hiện tại là Áp dụng', () => {
    const p = changeSteps({ ...BASE, status: 'APPROVED', addendum: { status: 'PENDING_EFFECTIVE' } })
    expect(states(p)).toEqual(['done', 'done', 'done', 'done', 'current'])
    expect(p.current.label).toBe('Áp dụng')
  })

  it('Đã áp dụng: mọi bước xong, không còn bước hiện tại', () => {
    const p = changeSteps({ ...BASE, status: 'APPLIED', addendum: { status: 'APPLIED' } })
    expect(states(p)).toEqual(['done', 'done', 'done', 'done', 'done'])
    expect(p.current).toBeNull()
    expect(p.position).toBe(5)
  })

  it('Áp dụng không thành: bước Áp dụng ghi là failed', () => {
    const p = changeSteps({ ...BASE, status: 'APPLY_FAILED', addendum: { status: 'PENDING_EFFECTIVE' } })
    expect(states(p)).toEqual(['done', 'done', 'done', 'done', 'failed'])
  })

  it('thay đổi nhỏ: không có xác nhận người đại diện, không có ký phụ lục', () => {
    const p = changeSteps({ ...BASE, minorChange: true, representativeConfirmationRequired: false })
    expect(names(p)).toEqual(['Lập yêu cầu', 'Duyệt', 'Áp dụng'])
    expect(states(p)).toEqual(['done', 'current', 'todo'])
  })

  it('người đại diện tự gửi qua cổng (không cần xác nhận thêm): bỏ bước Xác nhận, vẫn có Ký phụ lục', () => {
    const p = changeSteps({ ...BASE, representativeConfirmationRequired: false })
    expect(names(p)).toEqual(['Lập yêu cầu', 'Duyệt', 'Ký phụ lục', 'Áp dụng'])
  })

  it.each(['REJECTED', 'CANCELLED', 'SUPERSEDED'])('%s: không hiện tiến trình', (status) => {
    expect(changeSteps({ ...BASE, status })).toBeNull()
  })
})

describe('displayStatus', () => {
  const AWAITING = { status: 'APPROVED', addendum: { status: 'PENDING_SIGNATURE', createdAt: '2026-11-01T03:00:00Z' } }

  it('Đã duyệt mà phụ lục Chờ ký: chữ "Đã duyệt, chờ ký", tông chú ý, kèm số ngày', () => {
    const d = displayStatus(AWAITING, REQUEST_STATUS, new Date('2026-11-06T03:00:00'))
    expect(d.text).toBe('Đã duyệt, chờ ký')
    expect(d.tone).toBe('attention')
    expect(d.days).toBe(5)
    expect(d.overdue).toBe(false)
  })

  it('Chờ ký từ 7 ngày: overdue', () => {
    expect(displayStatus(AWAITING, REQUEST_STATUS, new Date('2026-11-09T03:00:00')).overdue).toBe(true)
  })

  it('trạng thái khác: không có tông riêng, để StatusBadge quyết', () => {
    const d = displayStatus({ status: 'DRAFT' }, REQUEST_STATUS)
    expect(d.text).toBe('Nháp')
    expect(d.tone).toBeNull()
  })
})
