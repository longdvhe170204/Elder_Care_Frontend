import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api'
import { problemOf } from './problem'

// 000 T099: Problem Details (RFC 9457) của backend đổi thành nội dung báo lỗi tiếng Việt (DESIGN.md 7.4, NFR-11).
describe('problemOf', () => {
  it('tieuDeTheoMaTrangThai_khongDungTitleTiengAnhCuaBackend', () => {
    const p = problemOf(
      new ApiError(403, { title: 'Forbidden', status: 403, errorCode: 'PERMISSION_DENIED', detail: 'Không có quyền' }),
    )
    expect(p.title).toBe('Không có quyền thực hiện')
    expect(p.detail).toBe('Không có quyền')
    expect(p.errorCode).toBe('PERMISSION_DENIED')
  })

  it('409_giuDieuKienChuaThoa', () => {
    const unmet = [{ code: 'BR-M15-06', description: 'Trùng tên mục đang hiệu lực' }]
    const p = problemOf(
      new ApiError(409, { title: 'Conflict', errorCode: 'CONDITION_NOT_MET', unmetConditions: unmet }),
    )
    expect(p.title).toBe('Chưa thực hiện được')
    expect(p.unmetConditions).toEqual(unmet)
  })

  it('412_giuGiaTriMoi', () => {
    const p = problemOf(new ApiError(412, { errorCode: 'VERSION_MISMATCH', currentValue: { version: 3 } }))
    expect(p.title).toBe('Dữ liệu đã thay đổi')
    expect(p.detail).toBe('Người khác vừa lưu thay đổi. Xem giá trị mới rồi thực hiện lại.')
    expect(p.currentValue).toEqual({ version: 3 })
  })

  it('loiMang_baoKiemTraKetNoi', () => {
    const p = problemOf(new TypeError('Failed to fetch'))
    expect(p.status).toBe(0)
    expect(p.title).toBe('Không kết nối được máy chủ')
    expect(p.unmetConditions).toEqual([])
  })

  it('loiKhongCoThanProblem_dungTieuDeChung', () => {
    const p = problemOf(new ApiError(500, null))
    expect(p.title).toBe('Máy chủ gặp lỗi')
    expect(p.detail).toBe('Thử lại sau ít phút. Nếu vẫn lỗi, báo cho quản trị hệ thống.')
  })

  it('loiKyThuat_chuyenThanhThongBaoRoNghia', () => {
    const p = problemOf(
      new ApiError(409, {
        errorCode: 'DAY_CARE_CAPACITY_UNSET',
        detail: 'Viện chưa đặt CFG-M03-01',
      }),
    )
    expect(p.detail).toBe(
      'Viện chưa thiết lập sức chứa khu nghỉ bán trú. Vui lòng cấu hình tham số sức chứa trước khi duyệt yêu cầu bán trú.',
    )
  })

  it('loiCoMaNghiepVu_loaiBoMaKyThuat', () => {
    const p = problemOf(
      new ApiError(409, {
        detail: 'Ngày hiệu lực sớm hơn ngày bắt đầu hợp đồng gốc (FR-040, DBR-07)',
        unmetConditions: [
          { code: 'FR-041', description: 'Người bán trú không có giường để đổi (FR-041)' },
          { code: 'Q-415', description: 'Cần chọn người đại diện đã xác nhận (Q-415)' },
        ],
      }),
    )
    expect(p.detail).toBe('Ngày hiệu lực sớm hơn ngày bắt đầu hợp đồng gốc')
    expect(p.unmetConditions[0].description).toBe('Người bán trú không có giường để đổi')
    expect(p.unmetConditions[1].description).toBe('Cần chọn người đại diện đã xác nhận')
  })
})
