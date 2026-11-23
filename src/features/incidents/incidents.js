import { getResidents, getResidentsById } from '@/api/api001'
import {
  getAlerts,
  getAlertsById,
  getIncidentFloors,
  getIncidentTypes,
  getIncidents,
  getIncidentsById,
  getIncidentsByIdFollowUpTasks,
  getProgressionTypes,
  postIncidents,
  postIncidentsByIdAssignHandler,
  postIncidentsByIdChangeLevel,
  postIncidentsByIdConfirmWishCheck,
  postIncidentsByIdEndPostFallMonitoring,
  postIncidentsByIdClose,
  postIncidentsByIdJoinHandling,
  postIncidentsByIdMoveToMonitoring,
  postIncidentsByIdProgressions,
  postIncidentsByIdReceive,
  postIncidentsByIdReopen,
} from '@/api/api007'
import { isOpen, residentName } from './incidentView'

// Đọc và ghi sự cố qua client sinh từ hợp đồng (api-007 incidents, incident-types, progression-types; api-001 Profile,
// danh sách người cao tuổi). Danh mục hoặc hồ sơ không đọc được thì màn ghi tên chung, không chặn danh sách.

export async function loadIncidentBoard() {
  const [incidents, types] = await Promise.all([getIncidents({}), getIncidentTypes({}).catch(() => ({ data: [] }))])
  const ids = [...new Set(incidents.data.map((i) => i.content?.residentId).filter((id) => id != null))]
  const profiles = await Promise.allSettled(ids.map((id) => getResidentsById({ path: { id } })))
  const names = {}
  const statuses = {}
  ids.forEach((id, i) => {
    if (profiles[i].status !== 'fulfilled') return
    names[id] = residentName(profiles[i].value.data)
    statuses[id] = profiles[i].value.data?.status
  })
  return { incidents: incidents.data, types: types.data ?? [], names, statuses }
}

// Trạng thái hiện tại của người cao tuổi (api-001) để báo vì sao chưa chuyển viện được; không đọc được thì trả null
export async function loadResidentStatus(residentId) {
  try {
    const { data } = await getResidentsById({ path: { id: residentId } })
    return data?.status ?? null
  } catch {
    return null
  }
}

// Cảnh báo đã chuyển thành hoặc gắn vào sự cố; cảnh báo từ nút SOS, nút hỗ trợ đọc thêm chi tiết (người bấm, ai tới, ai
// đến giúp) để sự cố ghi rõ bắt đầu từ đâu
export async function loadLinkedAlerts(incidentId) {
  try {
    const { data } = await getAlerts({})
    const linked = (data ?? []).filter((a) => a.incidentId === incidentId)
    return await Promise.all(
      linked.map((a) =>
        ['SOS', 'ASSIST_BUTTON'].includes(a.origin)
          ? getAlertsById({ path: { id: a.id } }).then(
              ({ data: detail }) => detail ?? a,
              () => a,
            )
          : a,
      ),
    )
  } catch {
    return []
  }
}

// Sự cố đang mở của một người cao tuổi, để chọn gắn cảnh báo cùng vụ; không đọc được thì coi như không có
export async function loadOpenIncidents(residentId) {
  try {
    const { data } = await getIncidents({ query: { residentId } })
    return (data ?? []).filter(isOpen)
  } catch {
    return []
  }
}

// Việc tiếp theo của sự cố (FR-045b); null khi không đọc được để màn ẩn khối, không báo sai là chưa có việc
export async function loadFollowUps(id) {
  try {
    const { data } = await getIncidentsByIdFollowUpTasks({ path: { id } })
    return data ?? []
  } catch {
    return null
  }
}

export async function loadIncident(id) {
  const [incident, progressionTypes] = await Promise.all([
    getIncidentsById({ path: { id } }),
    getProgressionTypes({}).catch(() => ({ data: [] })),
  ])
  return { incident: incident.data, progressionTypes: progressionTypes.data ?? [] }
}

export async function loadFloorChoices() {
  const { data } = await getIncidentFloors({})
  return data ?? []
}

export async function loadResidentChoices() {
  const { data } = await getResidents({})
  return (data.items ?? []).map((r) => ({ id: r.id, code: r.profileCode, name: residentName(r), status: r.status }))
}

const key = () => ({ 'Idempotency-Key': crypto.randomUUID() })

const COMMANDS = {
  receive: postIncidentsByIdReceive,
  'assign-handler': postIncidentsByIdAssignHandler,
  'join-handling': postIncidentsByIdJoinHandling,
  progressions: postIncidentsByIdProgressions,
  'change-level': postIncidentsByIdChangeLevel,
  'move-to-monitoring': postIncidentsByIdMoveToMonitoring,
  'confirm-wish-check': postIncidentsByIdConfirmWishCheck,
  'end-post-fall-monitoring': postIncidentsByIdEndPostFallMonitoring,
  reopen: postIncidentsByIdReopen,
  close: postIncidentsByIdClose,
}

export function runIncidentCommand(id, command, body) {
  return COMMANDS[command]({ path: { id }, headers: key(), ...(body ? { body } : {}) })
}

export async function recordIncident(body) {
  const { data } = await postIncidents({ headers: key(), body })
  return data
}
