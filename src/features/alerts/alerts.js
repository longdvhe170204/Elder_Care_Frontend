import { getResidents, getResidentsById } from '@/api/api001'
import {
  getAlerts,
  getIncidentTypes,
  getAlertsById,
  postAlerts,
  postAlertsByIdActivateEmergency,
  postAlertsByIdAssign,
  postAlertsByIdChangeLevel,
  postAlertsByIdClose,
  postAlertsByIdConvertToIncident,
  postAlertsByIdJoinHelp,
  postAlertsByIdFollowUps,
  postAlertsByIdReceive,
  postAlertsByIdStartHandling,
  postIncidentsByIdReceive,
} from '@/api/api007'
import { residentName, setIncidentTypeNames } from './alertView'

// Đọc và ghi cảnh báo qua client sinh từ hợp đồng (api-007 alerts; api-001 Profile cho họ tên). Hồ sơ không đọc được
// thì ghi "Người cao tuổi", không chặn danh sách; danh sách lỗi thì ném lỗi cho màn.

// background: lần hỏi lại tự động của màn, không tính là thao tác của người dùng (không gia hạn phiên)
const quiet = (options) => (options?.background ? { headers: { 'X-Background-Refresh': 'true' } } : {})

export async function loadAlertBoard(options) {
  const [{ data }, types] = await Promise.all([
    getAlerts(quiet(options)),
    getIncidentTypes(quiet(options)).catch(() => ({ data: [] })),
  ])
  setIncidentTypeNames(types.data)
  const ids = [...new Set(data.map((a) => a.residentId).filter((id) => id != null))]
  const profiles = await Promise.allSettled(ids.map((id) => getResidentsById({ path: { id }, ...quiet(options) })))
  const names = {}
  ids.forEach((id, i) => {
    if (profiles[i].status === 'fulfilled') names[id] = residentName(profiles[i].value.data)
  })
  return { alerts: data, names }
}

// Người đang xử lý cảnh báo đã nhận việc rồi: sự cố vừa tạo từ cảnh báo của họ thì họ là người xử lý luôn, không bắt
// tiếp nhận lần hai. Không nhận được (thiếu quyền, người khác đã nhận) thì để sự cố ở Mới cho người có quyền.
export async function receiveCreatedIncident(incident) {
  if (!incident?.id || !(incident.allowedCommands ?? []).includes('receive')) return false
  try {
    await postIncidentsByIdReceive({ path: { id: incident.id }, headers: { 'Idempotency-Key': crypto.randomUUID() } })
    return true
  } catch {
    return false
  }
}

export async function loadIncidentTypes() {
  const { data } = await getIncidentTypes({})
  return (data ?? []).filter((t) => t.status !== 'INACTIVE')
}

export async function loadResidentChoices() {
  const { data } = await getResidents({})
  return (data.items ?? []).map((r) => ({ id: r.id, code: r.profileCode, name: residentName(r) }))
}

export async function createAlert(body) {
  const { data } = await postAlerts({ headers: { 'Idempotency-Key': crypto.randomUUID() }, body })
  return data
}

export async function loadAlert(id, options) {
  const [{ data }, types] = await Promise.all([
    getAlertsById({ path: { id }, ...quiet(options) }),
    getIncidentTypes(quiet(options)).catch(() => ({ data: [] })),
  ])
  setIncidentTypeNames(types.data)
  return data
}

const COMMANDS = {
  receive: postAlertsByIdReceive,
  assign: postAlertsByIdAssign,
  'start-handling': postAlertsByIdStartHandling,
  close: postAlertsByIdClose,
  'change-level': postAlertsByIdChangeLevel,
  'convert-to-incident': postAlertsByIdConvertToIncident,
  'activate-emergency': postAlertsByIdActivateEmergency,
  'join-help': postAlertsByIdJoinHelp,
  'follow-up': postAlertsByIdFollowUps,
}

export function runAlertCommand(id, command, body) {
  return COMMANDS[command]({
    path: { id },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    ...(body ? { body } : {}),
  })
}
