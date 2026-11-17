import { describe, expect, it } from 'vitest'
import { NAV_GROUPS, PRIMARY_BY_ROLE, groupOfPage, navForRole } from './navigation'

const keys = (groups) => groups.flatMap((g) => g.items.map((i) => i.key))

// 002 FR-042: có phiên thật thì menu theo quyền ở GET /me/permissions; bản mẫu thì theo vai trò (Phụ lục 27).
describe('navForRole', () => {
  it('có quyền thật: chỉ hiện mục có chức năng được cấp, cùng Yêu cầu phê duyệt, Thông báo, Chờ xem lại', () => {
    const granted = new Set(['TASK_CHECKLIST', 'MEDICATION_ADMINISTRATION'])

    // care-tasks đứng đầu vì thuộc nhóm "Việc chính" của Nhân viên chăm sóc
    expect(keys(navForRole('CAREGIVER', (fn) => granted.has(fn)))).toEqual([
      'care-tasks',
      'approval-requests',
      'notifications',
      'pending-review-records',
      'medication',
    ])
  })

  it('có quyền thật: tài khoản nhiều vai trò thấy mục mà vai trò chính không có', () => {
    // Vai trò chính Nhân viên chăm sóc nhưng tài khoản có thêm quyền Danh mục thuốc
    expect(keys(navForRole('CAREGIVER', (fn) => fn === 'MEDICATION_CATALOG'))).toContain('medication-catalog')
  })

  // Quyền nạp từ Phụ lục 27 (V002_04) của từng vai trò ở các chức năng mà bốn mục dưới đây dùng
  const GRANTED = {
    NURSING_HOME_MANAGER: ['CARE_PLAN', 'VITAL_SIGN', 'ALERT_THRESHOLD', 'EXAM_TREATMENT', 'ACCOUNT_PERMISSION_PARAMETER'],
    FLOOR_MANAGER: ['CARE_PLAN', 'VITAL_SIGN', 'ALERT_THRESHOLD', 'EXAM_TREATMENT'],
    DOCTOR: ['CARE_PLAN', 'VITAL_SIGN', 'ALERT_THRESHOLD', 'EXAM_TREATMENT'],
    NURSING_STAFF: ['CARE_PLAN', 'VITAL_SIGN', 'ALERT_THRESHOLD', 'EXAM_TREATMENT'],
    CAREGIVER: ['CARE_PLAN', 'VITAL_SIGN'],
    KITCHEN_STAFF: [],
    OFFICE_STAFF: ['ACCOUNT_PERMISSION_PARAMETER'],
    ACCOUNTANT: [],
  }
  const rolesSeeing = (key) =>
    Object.keys(GRANTED).filter((role) => keys(navForRole(role, (fn) => GRANTED[role].includes(fn))).includes(key))

  it('có quyền thật: Danh mục sức khỏe chỉ hiện cho Quản lý viện, Bác sĩ, Điều dưỡng', () => {
    expect(rolesSeeing('health-catalog')).toEqual(['NURSING_HOME_MANAGER', 'DOCTOR', 'NURSING_STAFF'])
  })

  it('có quyền thật: Giấy phép và khám không hiện cho Hành chính', () => {
    expect(rolesSeeing('facility-license')).toEqual(['NURSING_HOME_MANAGER', 'FLOOR_MANAGER', 'DOCTOR', 'NURSING_STAFF'])
  })

  it('có quyền thật: Thời khóa biểu chỉ hiện cho Trưởng tầng, Điều dưỡng (005 FR-048)', () => {
    expect(rolesSeeing('care-timetable')).toEqual(['FLOOR_MANAGER', 'NURSING_STAFF'])
  })

  it('có quyền thật: Lịch đo và ngưỡng không hiện cho Nhân viên chăm sóc', () => {
    expect(rolesSeeing('measurement-schedules')).toEqual(['NURSING_HOME_MANAGER', 'FLOOR_MANAGER', 'DOCTOR', 'NURSING_STAFF'])
  })

  it('bản mẫu không có backend: lọc theo vai trò', () => {
    const expected = NAV_GROUPS.flatMap((g) => g.items)
      .filter((i) => i.roles.includes('KITCHEN_STAFF'))
      .map((i) => i.key)

    // cùng tập mục; mục "Việc chính" của Nhân viên bếp lên đầu
    expect([...keys(navForRole('KITCHEN_STAFF'))].sort()).toEqual([...expected].sort())
    expect(keys(navForRole('KITCHEN_STAFF')).slice(0, 3)).toEqual(PRIMARY_BY_ROLE.KITCHEN_STAFF)
  })

  it('mục chưa có màn thì ẩn, có màn thì hiện', () => {
    const built = new Set(['care-tasks'])
    const all = () => true

    expect(keys(navForRole('NURSING_STAFF', all, built))).toEqual(['care-tasks'])
    expect(keys(navForRole('NURSING_STAFF', null, built))).toEqual(['care-tasks'])
  })

  it('mục có chức năng đều ghi mã chức năng', () => {
    const withoutFunctions = NAV_GROUPS.flatMap((g) => g.items)
      .filter((i) => !i.functions)
      .map((i) => i.key)

    expect(withoutFunctions).toEqual(['approval-requests', 'notifications', 'pending-review-records'])
  })

  it('nhóm nghiệp vụ có id tiếng Anh riêng và tên tiếng Việt; khối đầu không có tên', () => {
    const [first, ...rest] = NAV_GROUPS

    expect(first.label).toBeNull()
    expect(rest.every((g) => /^[a-z]+(-[a-z]+)*$/.test(g.id) && g.label)).toBe(true)
    expect(new Set(NAV_GROUPS.map((g) => g.id)).size).toBe(NAV_GROUPS.length)
  })

  it('bản mẫu: nhóm không còn mục nào sau khi lọc theo vai trò thì ẩn cả nhóm', () => {
    const groups = navForRole('KITCHEN_STAFF')

    expect(groups.map((g) => g.label)).toContain('Dinh dưỡng, bữa ăn')
    expect(groups.map((g) => g.label)).not.toContain('Chăm sóc hằng ngày')
    expect(groups.every((g) => g.items.length > 0)).toBe(true)
  })

  it('có quyền thật: nhóm không có chức năng nào được cấp thì ẩn', () => {
    const labels = navForRole('NURSING_STAFF', (fn) => fn === 'MEDICATION_ADMINISTRATION').map((g) => g.label)

    // Phát thuốc là việc chính của Điều dưỡng nên nằm ở nhóm ghim; nhóm "Thuốc và sức khỏe" không còn mục nào thì ẩn
    expect(labels).toEqual(['Việc chính', null])
  })

  // Nhóm "Việc chính" ghim đầu menu theo vai trò (chủ dự án duyệt 2026-11-17, DESIGN.md 5 "Nhóm menu")
  it('việc chính: nhóm ghim đứng đầu, đúng thứ tự của vai trò, không lặp lại ở nhóm khác', () => {
    const groups = navForRole('OFFICE_STAFF')
    const [primary] = groups

    expect(primary.id).toBe('primary')
    expect(primary.label).toBe('Việc chính')
    expect(primary.pinned).toBe(true)
    expect(primary.items.map((i) => i.key)).toEqual([
      'admission-applications',
      'residents',
      'contracts',
      'waiting-list',
      'beds',
      'family-members',
    ])
    const all = keys(groups)
    expect(all.filter((key, i) => all.indexOf(key) !== i)).toEqual([])
    expect(keys(groups.slice(1))).not.toContain('admission-applications')
  })

  it('việc chính: chỉ gồm mục người xem được phép thấy; không có mục nào thì không có nhóm', () => {
    const granted = new Set(['TASK_CHECKLIST'])
    const groups = navForRole('CAREGIVER', (fn) => granted.has(fn))

    expect(groups[0].items.map((i) => i.key)).toEqual(['care-tasks'])
    expect(navForRole('CAREGIVER', () => false)[0].id).toBe('general')
  })

  it('việc chính: mỗi khóa đều là mục có thật và vai trò đó có quyền ở bản mẫu', () => {
    const items = new Map(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i]))
    for (const [role, list] of Object.entries(PRIMARY_BY_ROLE)) {
      for (const key of list) {
        expect(items.has(key), `${role}: ${key}`).toBe(true)
        expect(items.get(key).roles, `${role}: ${key}`).toContain(role)
      }
    }
  })

  it('groupOfPage: mục việc chính của vai trò thuộc nhóm ghim', () => {
    expect(groupOfPage('admission-applications', 'OFFICE_STAFF')).toBe('primary')
    expect(groupOfPage('admission-applications', 'NURSING_HOME_MANAGER')).toBe('residency')
  })

  it('groupOfPage: trả id nhóm chứa trang', () => {
    expect(groupOfPage('medication')).toBe('medication-health')
    expect(groupOfPage('dashboard')).toBe('general')
    expect(groupOfPage('khong-co')).toBeUndefined()
  })

  it('mỗi mục menu có khóa riêng', () => {
    const all = keys(NAV_GROUPS)

    expect(all.filter((key, i) => all.indexOf(key) !== i)).toEqual([])
  })
})
