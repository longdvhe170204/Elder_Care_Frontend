import { createContext, useContext, useEffect, useState } from 'react'
import { getMe, getMePermissions } from '@/api'

// 002 T026 (FR-042): ẩn nút, menu theo quyền hiện hành (GET /me/permissions) và theo allowedCommands của đối tượng.
// Chỉ để hiển thị; backend luôn kiểm lại ở lệnh (constitution XI). Chưa tải xong hoặc lỗi thì ẩn.

const PermissionsContext = createContext({ status: 'loading', keys: new Set() })

const keyOf = (fn, operation) => `${fn}:${operation}`

// Chú thích Phụ lục 27 giới hạn thao tác ghi theo vai trò mà /me/permissions không phân biệt: ²⁶ ở dòng "Tiếp nhận, hợp
// đồng, đặt cọc" là của cả Hành chính (AC-09) và Kế toán (AC-14), nhưng chỉ Hành chính lập tiếp nhận, hợp đồng; Kế toán chỉ
// thu cọc ở Số dư (BALANCE_LEDGER). Backend chặn ở lệnh (ContractService, AdmissionApplicationService…); web ẩn nút theo đó.
// Chưa đọc được vai trò (/me lỗi hoặc chưa trả) thì giữ quyền như /me/permissions.
const WRITE_FOOTNOTE_ROLES = { 26: 'AC-09' }
const WRITES = ['CREATE', 'UPDATE']

function keysOf(entries, roles) {
  const kept = entries.filter(
    (p) =>
      !roles ||
      !WRITES.includes(p.operation) ||
      !(p.footnoteCodes ?? []).some((c) => WRITE_FOOTNOTE_ROLES[c] && !roles.includes(WRITE_FOOTNOTE_ROLES[c])),
  )
  return new Set(kept.map((p) => keyOf(p.function, p.operation)))
}

export function PermissionsProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', entries: [] })
  const [roles, setRoles] = useState(null)

  useEffect(() => {
    let cancelled = false
    getMePermissions()
      .then(({ data }) => {
        if (!cancelled) setState({ status: 'ready', entries: data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', entries: [] })
      })
    getMe()
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data?.roles)) setRoles(data.roles)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const value = { status: state.status, keys: keysOf(state.entries, roles) }
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

// can('TASK_CHECKLIST', 'CREATE'): người dùng có khóa quyền này ở /me/permissions
// eslint-disable-next-line react-refresh/only-export-components
export function usePermissions() {
  const { status, keys } = useContext(PermissionsContext)
  return {
    status,
    can: (fn, operation) => keys.has(keyOf(fn, operation)),
    // Có ít nhất một thao tác của chức năng (để hiện mục menu)
    hasFunction: (fn) => [...keys].some((k) => k.startsWith(`${fn}:`)),
  }
}

// Lệnh có trong allowedCommands mà backend trả cùng đối tượng
// eslint-disable-next-line react-refresh/only-export-components
export function isAllowed(resource, command) {
  return (resource?.allowedCommands ?? []).includes(command)
}

// <IfAllowed function="X" operation="Y"> theo khóa quyền; <IfAllowed resource={obj} command="approve"> theo đối tượng
export function IfAllowed({ function: fn, operation, resource, command, children }) {
  const { can } = usePermissions()
  const shown = resource !== undefined ? isAllowed(resource, command) : can(fn, operation)
  return shown ? children : null
}
