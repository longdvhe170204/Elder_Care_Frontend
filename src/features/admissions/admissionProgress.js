// Tiến độ của màn Hồ sơ tiếp nhận (chủ dự án chọn phương án B "Việc tiếp theo", 2026-11-21; DESIGN.md 5.3). Chỉ tính từ
// dữ liệu màn đã tải: danh sách điều kiện, cảnh báo của lệnh Hoàn tất tiếp nhận (api-004 FR-004, FR-004a), ý kiến vào ở,
// lệnh được phép của hồ sơ và khóa quyền. Không tự làm bước nào thay người (Q-306, Q-307).
//
// state: done (Xong), todo (bước là điều kiện, Chưa xong), optional (không bắt buộc, Chưa làm), after (sau tiếp nhận),
// closed (lượt đã đóng, không còn kiểm).
// mine(ctx): vai trò đang đăng nhập làm được bước này; who: ai làm, ghi "Chờ <who>" ở dòng bước.
// view (danh sách bước một cột, chủ dự án duyệt 2026-11-26, DESIGN.md 5.3): done, mine (bước chưa xong của vai trò đang
// đăng nhập), wait (bước chưa xong của vai trò khác), after, closed. required: bước là điều kiện Hoàn tất tiếp nhận (dấu *).
// doLabel: tên nút nói rõ việc của bước.

const DONE_CONDITION = ['MET', 'MET_BY_EXCEPTION', 'AUTOMATIC', 'NOT_APPLICABLE']
const hasCommand = (ctx, ...commands) => commands.some((c) => ctx.residentCommands.includes(c))
const hasWarning = (ctx, ...codes) => codes.some((code) => ctx.warnings.some((w) => w.code === code))
// Mỗi phiếu nguyện vọng đã có phiếu hoặc có bản Nháp chờ kiểm chứng
const bothWishesDrafted = (ctx) =>
  (!hasWarning(ctx, 'MISSING_END_OF_LIFE_WISH') || hasWarning(ctx, 'UNVERIFIED_END_OF_LIFE_WISH_DRAFT')) &&
  (!hasWarning(ctx, 'MISSING_TREATMENT_WISH') || hasWarning(ctx, 'UNVERIFIED_TREATMENT_WISH_DRAFT'))

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
        doLabel: 'Ghi ý kiến',
        // Lệnh ghi ý kiến kiểm quyền Tạo hợp đồng, đặt cọc (AdmissionOpinionService.record)
        mine: (ctx) => ctx.can('ADMISSION_CONTRACT_DEPOSIT', 'CREATE'),
        who: 'Hành chính',
      },
      {
        key: 'contacts',
        label: 'Người thân: liên hệ chính, người đại diện',
        condition: 'ADM_F_CONTACTS',
        page: ['family-members', 'Mở Người thân và quyền', 'resident', { openAdd: true }],
        doLabel: 'Ghi người thân',
        mine: (ctx) => ctx.can('FAMILY_MEMBER_PERMISSION', 'CREATE'),
        who: 'Hành chính',
      },
      {
        key: 'consent',
        label: 'Bản đồng ý chia sẻ dữ liệu',
        action: 'resident',
        part: 'consent',
        done: (ctx) => !hasWarning(ctx, 'MISSING_CONSENT'),
        doLabel: 'Ghi bản đồng ý',
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
        doLabel: 'Ghi sức khỏe ban đầu',
        // Đã có bản Nháp thì bước chỉ còn chờ Bác sĩ xác nhận (chủ dự án duyệt 2026-11-26)
        mine: (ctx) =>
          ctx.healthDraft
            ? hasCommand(ctx, 'CONFIRM_INITIAL_HEALTH_RECORD')
            : hasCommand(ctx, 'WRITE_INITIAL_HEALTH_RECORD', 'CONFIRM_INITIAL_HEALTH_RECORD', 'RECORD_HEALTH_ITEM'),
        who: (ctx) => (ctx.healthDraft ? 'Bác sĩ' : 'Hành chính, Bác sĩ'),
      },
      {
        key: 'wishes',
        label: 'Nguyện vọng cuối đời, nguyện vọng khi điều trị',
        action: 'resident',
        part: 'wishes',
        doLabel: 'Ghi nguyện vọng',
        done: (ctx) =>
          !hasWarning(
            ctx,
            'MISSING_END_OF_LIFE_WISH',
            'MISSING_TREATMENT_WISH',
            'UNVERIFIED_END_OF_LIFE_WISH_DRAFT',
            'UNVERIFIED_TREATMENT_WISH_DRAFT',
          ),
        // Đủ hai phiếu (Nháp hoặc đã có) thì chỉ còn chờ Bác sĩ, Điều dưỡng kiểm chứng (chủ dự án duyệt 2026-11-26)
        mine: (ctx) =>
          bothWishesDrafted(ctx)
            ? hasCommand(ctx, 'RECORD_END_OF_LIFE_WISH', 'RECORD_TREATMENT_WISH')
            : hasCommand(
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
        doLabel: 'Đánh giá đầu vào',
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
        doLabel: 'Chọn giường',
        mine: (ctx) => ctx.can('BED_ALLOCATION', 'CREATE'),
        who: 'Hành chính, Trưởng tầng',
      },
      {
        key: 'contract',
        label: 'Hợp đồng',
        condition: 'ADM_B_CONTRACT',
        extra: 'ADM_E_CONTRACT_LEVEL',
        action: 'contract',
        note: 'Cần hợp đồng Hiệu lực, ghi đúng mức đã đánh giá',
        mine: (ctx) => ctx.can('ADMISSION_CONTRACT_DEPOSIT', ctx.hasContract ? 'UPDATE' : 'CREATE'),
        who: 'Hành chính',
      },
      {
        key: 'deposit',
        label: 'Đặt cọc',
        condition: 'ADM_C_DEPOSIT',
        // Kế toán ghi thu trong popup tại chỗ, chỉ sổ cọc (audit 2026-11-27, thay việc mở màn Số dư của audit 2026-11-18)
        action: 'deposit',
        doLabel: 'Ghi thu tiền cọc',
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

// Có bản Nháp nguyện vọng cuối đời chờ kiểm chứng thì không hiện thêm cảnh báo "chưa có nguyện vọng cuối đời" (hai câu
// cùng nói phiếu chưa có hiệu lực, đọc như mâu thuẫn)
export function visibleWarnings(warnings = []) {
  const hasDraft = warnings.some((w) => w.code === 'UNVERIFIED_END_OF_LIFE_WISH_DRAFT')
  return hasDraft ? warnings.filter((w) => w.code !== 'MISSING_END_OF_LIFE_WISH') : warnings
}

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
  healthDraft = false,
  // Mã điều kiện web biết đã đạt dù backend chưa tính (ADM_C_DEPOSIT khi hợp đồng còn Chờ ký mà đã thu đủ cọc)
  metConditions = [],
}) {
  const lines = conditions?.conditions ?? []
  const conditionOf = conditionFinder(lines)
  const ctx = { opinion, residentCommands, hasContract, can, healthDraft, warnings: conditions?.warnings ?? [] }

  function stateOf(step) {
    if (step.after) return 'after'
    if (step.condition) {
      if (closed) return 'closed'
      const line = conditionOf(step.condition)
      const extra = step.extra && conditionOf(step.extra)
      const met = (code, l) => metConditions.includes(code) || (l && DONE_CONDITION.includes(l.status))
      const done = met(step.condition, line) && (!step.extra || met(step.extra, extra))
      return done ? 'done' : 'todo'
    }
    if (step.done(ctx)) return 'done'
    return closed ? 'closed' : 'optional'
  }

  const steps = {}
  const phases = PHASES.map((phase) => {
    const rows = phase.steps.map((step) => {
      const state = stateOf(step)
      const isMine = !!step.mine?.(ctx)
      const pending = state === 'todo' || state === 'optional'
      const view = pending ? (isMine ? 'mine' : 'wait') : state
      const who = typeof step.who === 'function' ? step.who(ctx) : step.who
      const row = { ...step, who, state, isMine, view, required: !!step.condition }
      steps[step.key] = row
      return row
    })
    return {
      title: phase.title,
      short: phase.short,
      steps: rows,
      done: rows.filter((r) => r.state === 'done').length,
      // Bước "Không còn kiểm" của lượt đã đóng không tính vào tổng
      total: rows.filter((r) => r.state !== 'closed').length,
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

  // Số đếm của bộ lọc: Việc của bạn, Bắt buộc chưa xong (bước là điều kiện chưa xong), Chờ người khác, Tất cả
  const counts = {
    mine: ordered.filter((s) => s.view === 'mine').length,
    required: open('todo').length,
    wait: ordered.filter((s) => s.view === 'wait').length,
    all: ordered.length,
  }
  const requiredSteps = ordered.filter((s) => s.required)

  return { steps, phases, next, waiting, counts, requiredSteps, done: open('done').length, conditionOf }
}
