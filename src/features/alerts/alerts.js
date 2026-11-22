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
  postAlertsByIdReceive,
  postAlertsByIdStartHandling,
  postIncidentsByIdJoinHandling,
  postIncidentsByIdReceive,
} from '@/api/api007'
import { residentName, setIncidentTypeNames } from './alertView'

// Đọc và ghi cảnh báo qua client sinh từ hợp đồng (api-007 alerts; api-001 Profile cho họ tên). Hồ sơ không đọc được
// thì ghi "Người cao tuổi", không chặn danh sách; danh sách lỗi thì ném lỗi cho màn.

export async function loadAlertBoard() {
  const [{ data }, types] = await Promise.all([getAlerts({}), getIncidentTypes({}).catch(() => ({ data: [] }))])
  setIncidentTypeNames(types.data)
  const ids = [...new Set(data.map((a) => a.residentId).filter((id) => id != null))]
  const profiles = await Promise.allSettled(ids.map((id) => getResidentsById({ path: { id } })))
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

// Tham gia xử lý sự cố Khẩn cấp đang mở của cùng người cao tuổi (FR-041), thay cho việc tạo thêm sự cố
export function joinIncident(incidentId) {
  return postIncidentsByIdJoinHandling({
    path: { id: incidentId },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })
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

export async function loadAlert(id) {
  const [{ data }, types] = await Promise.all([
    getAlertsById({ path: { id } }),
    getIncidentTypes({}).catch(() => ({ data: [] })),
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
}

export function runAlertCommand(id, command, body) {
  return COMMANDS[command]({
    path: { id },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    ...(body ? { body } : {}),
  })
}
