import { describe, expect, it } from 'vitest'
import { admissionProgress, visibleWarnings } from './admissionProgress'

// Hồ sơ tiếp nhận phương án B "Việc tiếp theo" (chủ dự án chọn 2026-11-21): trạng thái mỗi bước một bộ nhãn, tiến độ theo
// giai đoạn, việc tiếp theo là bước đầu tiên chưa xong mà vai trò đang đăng nhập làm được (bước là điều kiện trước, bước
// không bắt buộc sau; đủ điều kiện thì Hoàn tất tiếp nhận); việc của vai trò khác ghi ai làm.

const MET = (code) => ({ code, status: 'MET' })
const NOT_MET = (code) => ({ code, status: 'NOT_MET' })

function input(overrides = {}) {
  return {
    conditions: {
      conditions: [
        NOT_MET('ADM_A_ASSESSMENT'),
        NOT_MET('ADM_B_CONTRACT'),
        NOT_MET('ADM_C_DEPOSIT'),
        NOT_MET('ADM_D_BED'),
        { code: 'ADM_E_CONTRACT_LEVEL', status: 'NOT_MET' },
        MET('ADM_F_CONTACTS'),
      ],
      warnings: [{ code: 'MISSING_CONSENT' }, { code: 'MISSING_END_OF_LIFE_WISH' }],
    },
    opinion: { decision: 'AGREE' },
    residentCommands: ['RECORD_CONSENT', 'RECORD_FAMILY_DECLARED', 'WRITE_INITIAL_HEALTH_RECORD'],
    can: (fn, op) =>
      ['ADMISSION_CONTRACT_DEPOSIT:CREATE', 'ADMISSION_CONTRACT_DEPOSIT:UPDATE', 'BED_ALLOCATION:CREATE'].includes(
        `${fn}:${op}`,
      ),
    canComplete: true,
    closed: false,
    ...overrides,
  }
}

describe('admissionProgress', () => {
  it('nhanTrangThai_xong_chuaXong_chuaLam', () => {
    const { steps } = admissionProgress(input())
    expect(steps.profile.state).toBe('done')
    expect(steps.contacts.state).toBe('done')
    expect(steps.contract.state).toBe('todo')
    expect(steps.consent.state).toBe('optional')
    expect(steps.health.state).toBe('done')
    expect(steps.wishes.state).toBe('optional')
  })

  it('viecTiepTheo_buocDieuKienDauTienCuaVaiTro_truocBuocKhongBatBuoc', () => {
    // Hành chính: Đánh giá (Bác sĩ lập; Hành chính chỉ ghi Gia đình khai, không tính là làm bước này) rồi tới Giường
    expect(admissionProgress(input()).next.key).toBe('bed')
  })

  it('viecCuaNguoiKhac_ghiAiLam', () => {
    const { waiting } = admissionProgress(input())
    expect(waiting.map((s) => [s.key, s.who])).toEqual([
      ['assessment', 'Bác sĩ'],
      ['deposit', 'Kế toán'],
      ['wishes', 'Bác sĩ, Điều dưỡng'],
    ])
  })

  it('heBuocDieuKienCuaMinhThiSangBuocKhongBatBuoc_roiHoanTat', () => {
    const allMet = input({
      conditions: {
        conditions: [
          'ADM_A_ASSESSMENT',
          'ADM_B_CONTRACT',
          'ADM_C_DEPOSIT',
          'ADM_D_BED',
          'ADM_E_CONTRACT_LEVEL',
          'ADM_F_CONTACTS',
        ].map(MET),
        warnings: [{ code: 'MISSING_CONSENT' }],
      },
    })
    expect(admissionProgress(allMet).next.key).toBe('consent')
    const noWarnings = { ...allMet, conditions: { ...allMet.conditions, warnings: [] } }
    expect(admissionProgress(noWarnings).next.key).toBe('complete')
    expect(admissionProgress({ ...noWarnings, canComplete: false }).next).toBeNull()
  })

  it('tienDoTheoGiaiDoan', () => {
    const { phases } = admissionProgress(input())
    expect(phases.map((p) => [p.done, p.total])).toEqual([
      [3, 4],
      [1, 3],
      [0, 3],
      [0, 2],
    ])
  })

  it('luotDaDong_khongCoViecTiepTheo', () => {
    expect(admissionProgress(input({ closed: true, conditions: null })).next).toBeNull()
  })

  it('BF_01_luotDaDong_buocKhongConKiem_khongTinhVaoTong', () => {
    const { phases } = admissionProgress(input({ closed: true, conditions: null }))
    expect(phases.map((p) => [p.done, p.total])).toEqual([
      [3, 3],
      [2, 2],
      [0, 0],
      [0, 2],
    ])
  })
})

describe('visibleWarnings', () => {
  it('BF_01_coBanNhapNguyenVongChoKiemChung_anCanhBaoChuaCoNguyenVong', () => {
    const warnings = [
      { code: 'MISSING_END_OF_LIFE_WISH' },
      { code: 'MISSING_TREATMENT_WISH' },
      { code: 'UNVERIFIED_END_OF_LIFE_WISH_DRAFT' },
    ]
    expect(visibleWarnings(warnings).map((w) => w.code)).toEqual([
      'MISSING_TREATMENT_WISH',
      'UNVERIFIED_END_OF_LIFE_WISH_DRAFT',
    ])
    expect(visibleWarnings([{ code: 'MISSING_END_OF_LIFE_WISH' }])).toHaveLength(1)
  })
})
