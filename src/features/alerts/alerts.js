import { getResidentsById } from '@/api/api001'
import {
  getAlerts,
  getIncidentTypes,
  getAlertsById,
  postAlertsByIdActivateEmergency,
  postAlertsByIdChangeLevel,
  postAlertsByIdClose,
  postAlertsByIdConvertToIncident,
  postAlertsByIdReceive,
  postAlertsByIdStartHandling,
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

export async function loadIncidentTypes() {
  const { data } = await getIncidentTypes({})
  return (data ?? []).filter((t) => t.status !== 'INACTIVE')
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
