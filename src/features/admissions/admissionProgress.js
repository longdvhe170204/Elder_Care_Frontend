// Tiến độ của màn Hồ sơ tiếp nhận (chủ dự án chọn phương án B "Việc tiếp theo", 2026-11-21; DESIGN.md 5.3). Chỉ tính từ
// dữ liệu màn đã tải: danh sách điều kiện, cảnh báo của lệnh Hoàn tất tiếp nhận (api-004 FR-004, FR-004a), ý kiến vào ở,
// lệnh được phép của hồ sơ và khóa quyền. Không tự làm bước nào thay người (Q-306, Q-307).
//
// state: done (Xong), todo (bước là điều kiện, Chưa xong), optional (không bắt buộc, Chưa làm), after (sau tiếp nhận),
// closed (lượt đã đóng, không còn kiểm).
// mine(ctx): vai trò đang đăng nhập làm được bước này; who: ai làm, ghi ở "Đang chờ người khác".

const DONE_CONDITION = ['MET', 'MET_BY_EXCEPTION', 'AUTOMATIC', 'NOT_APPLICABLE']
const hasCommand = (ctx, ...commands) => commands.some((c) => ctx.residentCommands.includes(c))
const hasWarning = (ctx, ...codes) => codes.some((code) => ctx.warnings.some((w) => w.code === code))

// action: resident (hồ sơ người cao tuổi, mở sẵn phần `part` nếu có), opinion, bed, contract, hoặc màn sở hữu ở `page`
export const PHASES = [
  {
    title: 'Hồ sơ và đăng ký',
    short: 'Hồ sơ',
    steps: [
      { key: 'profile', label: 'Hồ sơ người cao tuổi và lượt đăng ký', action: 'resident', done: () => true },
      {
        key: 'opinion',
        label: 'Ý kiến của người cao tuổi về việc vào ở',
        action: 'opinion',
        done: (ctx) => !!ctx.opinion,
        mine: (ctx) => ctx.can('ADMISSION_CONTRACT_DEPOSIT', 'UPDATE'),
        who: 'Hành chính',
      },
      {
        key: 'contacts',
        label: 'Người thân: liên hệ chính, người đại diện',
        condition: 'ADM_F_CONTACTS',
        page: ['family-members', 'Mở Người thân và quyền'],
        mine: (ctx) => ctx.can('FAMILY_MEMBER_PERMISSION', 'CREATE'),
        who: 'Hành chính',
      },
      {
        key: 'consent',
        label: 'Bản đồng ý chia sẻ dữ liệu',
        action: 'resident',
        part: 'consent',
        done: (ctx) => !hasWarning(ctx, 'MISSING_CONSENT'),
        mine: (ctx) => hasCommand(ctx, 'RECORD_CONSENT'),
        who: 'Hành chính',
      },
    ],
  },
  {
    title: 'Sức khỏe và đánh giá',
    short: 'Sức khỏe',
    steps: [
      {
        key: 'health',
        label: 'Hồ sơ sức khỏe ban đầu',
        action: 'resident',
        part: 'health',
        done: (ctx) => !hasWarning(ctx, 'UNCONFIRMED_HEALTH_RECORD'),
        mine: (ctx) =>
          hasCommand(ctx, 'WRITE_INITIAL_HEALTH_RECORD', 'CONFIRM_INITIAL_HEALTH_RECORD', 'RECORD_HEALTH_ITEM'),
        who: 'Hành chính, Bác sĩ',
      },
      {
        key: 'wishes',
        label: 'Nguyện vọng cuối đời, nguyện vọng khi điều trị',
        action: 'resident',
        part: 'wishes',
        done: (ctx) =>
          !hasWarning(
            ctx,
            'MISSING_END_OF_LIFE_WISH',
            'MISSING_TREATMENT_WISH',
            'UNVERIFIED_END_OF_LIFE_WISH_DRAFT',
            'UNVERIFIED_TREATMENT_WISH_DRAFT',
          ),
        mine: (ctx) =>
          hasCommand(
            ctx,
            'RECORD_END_OF_LIFE_WISH',
            'RECORD_TREATMENT_WISH',
            'DRAFT_END_OF_LIFE_WISH',
            'DRAFT_TREATMENT_WISH',
          ),
        who: 'Bác sĩ, Điều dưỡng',
      },
      {
        key: 'assessment',
        label: 'Đánh giá đầu vào và mức chăm sóc',
        condition: 'ADM_A_ASSESSMENT',
        action: 'resident',
        part: 'assessment',
        mine: (ctx) => hasCommand(ctx, 'CREATE_ASSESSMENT', 'CONFIRM_ASSESSMENT'),
        who: 'Bác sĩ',
      },
    ],
  },
  {
    title: 'Giường, hợp đồng, đặt cọc',
    short: 'Giường, hợp đồng',
    steps: [
      {
        key: 'bed',
        label: 'Phân bổ giường',
        condition: 'ADM_D_BED',
        action: 'bed',
        mine: (ctx) => ctx.can('BED_ALLOCATION', 'CREATE'),
        who: 'Hành chính, Trưởng tầng',
      },
      {
        key: 'contract',
        label: 'Hợp đồng',
        condition: 'ADM_B_CONTRACT',
        extra: 'ADM_E_CONTRACT_LEVEL',
        action: 'contract',
        mine: (ctx) => ctx.can('ADMISSION_CONTRACT_DEPOSIT', ctx.hasContract ? 'UPDATE' : 'CREATE'),
        who: 'Hành chính',
      },
      {
        key: 'deposit',
        label: 'Đặt cọc',
        condition: 'ADM_C_DEPOSIT',
        note: 'Kế toán ghi thu tiền cọc khi gia đình nộp',
        // Kế toán ghi thu ở Số dư, thu chi; mở với người cao tuổi này đã chọn sẵn (audit 2026-11-18)
        page: ['balance', 'Xem tiền cọc', 'resident'],
        minePage: 'Ghi thu tiền cọc',
        mine: (ctx) => ctx.can('BALANCE_LEDGER', 'CREATE'),
        who: 'Kế toán',
      },
    ],
  },
  // Nhóm "Hoàn tất tiếp nhận" bỏ ngày 2026-11-18 theo yêu cầu chủ dự án: trùng cột Điều kiện Hoàn tất tiếp nhận
  {
    title: 'Sau tiếp nhận',
    short: 'Sau tiếp nhận',
    steps: [
      {
        key: 'registration',
        label: 'Khai báo cư trú',
        after: true,
        page: ['residence-registrations', 'Mở Khai báo cư trú'],
      },
      { key: 'care-plan', label: 'Kế hoạch chăm sóc', after: true, page: ['care-plans', 'Mở Kế hoạch chăm sóc'] },
    ],
  },
]

// Dòng chưa đạt của (a), (d), (f) mang mã của module sở hữu (INITIAL_ASSESSMENT_…, mã của 003, DBR_02), chỉ dòng đạt mang
// mã cố định; nên bước tìm theo mã, không thấy thì theo module của dòng (AdmissionConditionService, FR-004).
const CONDITION_MODULE = { ADM_A_ASSESSMENT: 'M01', ADM_D_BED: 'M03', ADM_F_CONTACTS: 'M10' }

export function conditionFinder(lines) {
  return (code) =>
    lines.find((c) => c.code === code) ??
    lines.find((c) => c.status === 'NOT_MET' && CONDITION_MODULE[code] && c.module === CONDITION_MODULE[code])
}

export function admissionProgress({
  conditions,
  opinion,
  residentCommands = [],
  hasContract = false,
  can,
  canComplete,
  closed,
}) {
  const lines = conditions?.conditions ?? []
  const conditionOf = conditionFinder(lines)
  const ctx = { opinion, residentCommands, hasContract, can, warnings: conditions?.warnings ?? [] }

  function stateOf(step) {
    if (step.after) return 'after'
    if (step.condition) {
      if (closed) return 'closed'
      const line = conditionOf(step.condition)
      const extra = step.extra && conditionOf(step.extra)
      const done = line && DONE_CONDITION.includes(line.status) && (!extra || DONE_CONDITION.includes(extra.status))
      return done ? 'done' : 'todo'
    }
    if (step.done(ctx)) return 'done'
    return closed ? 'closed' : 'optional'
  }

  const steps = {}
  const phases = PHASES.map((phase) => {
    const rows = phase.steps.map((step) => {
      const row = { ...step, state: stateOf(step), isMine: !!step.mine?.(ctx) }
      steps[step.key] = row
      return row
    })
    return {
      title: phase.title,
      short: phase.short,
      steps: rows,
      done: rows.filter((r) => r.state === 'done').length,
      total: rows.length,
    }
  })

  const ordered = phases.flatMap((p) => p.steps)
  const open = (state) => ordered.filter((s) => s.state === state)
  let next = null
  if (!closed) {
    next = open('todo').find((s) => s.isMine) ?? open('optional').find((s) => s.isMine) ?? null
    if (!next && canComplete && open('todo').length === 0) next = { key: 'complete', label: 'Hoàn tất tiếp nhận' }
  }
  const waiting = closed ? [] : [...open('todo'), ...open('optional')].filter((s) => !s.isMine && s.who)

  return { steps, phases, next, waiting, conditionOf }
}
