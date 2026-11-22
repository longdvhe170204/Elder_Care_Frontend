import { postCorrectionsByRecordTypeByOriginalRecordId } from '@/api/api000'
import { getMeShifts } from '@/api/api008'
import { addDays } from '@/features/activities/sessionView'
import { getResidentsById } from '@/api/api001'
import { getResidentsByResidentIdLocation } from '@/api/api003'
import {
  getMedicationDosesRounds,
  postMedicationDosesByDoseKeyAdminister,
  postMedicationDosesByDoseKeyClaim,
  postMedicationDosesByDoseKeyPostpone,
  postMedicationDosesByDoseKeyRefuse,
  postMedicationDosesByDoseKeyRelease,
  postMedicationDosesByDoseKeySkip,
} from '@/api/api006'
import { doseRoundView, hhmm, POSTPONE } from './doseRoundView'

// Đọc vòng phát thuốc và ghi kết quả liều qua client sinh từ hợp đồng (api-006 dose, api-001 Profile, api-003 vị trí,
// api-008 /me/shifts). Hồ sơ hoặc vị trí không đọc được thì thẻ ghi "chưa có", không chặn vòng thuốc.

const TIME_ZONE = 'Asia/Ho_Chi_Minh'
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })

export const todayVN = (now = new Date()) => TODAY.format(now)

async function currentShift(now) {
  try {
    const day = todayVN(now)
    const { data } = await getMeShifts({ query: { from: day, to: addDays(day, 1) } })
    const shift = (data ?? []).find((s) => new Date(s.startsAt) <= now && now <= new Date(s.endsAt))
    return shift ? { start: hhmm(shift.startsAt), end: hhmm(shift.endsAt) } : null
  } catch {
    return null
  }
}

export async function loadDoseRound(now = new Date()) {
  const { data: doses } = await getMedicationDosesRounds({})
  const ids = [...new Set(doses.map((d) => d.residentId))]
  const profiles = {}
  const locations = {}
  await Promise.all(
    ids.map(async (id) => {
      const [profile, location] = await Promise.allSettled([
        getResidentsById({ path: { id } }),
        getResidentsByResidentIdLocation({ path: { residentId: id } }),
      ])
      if (profile.status === 'fulfilled') profiles[id] = profile.value.data
      if (location.status === 'fulfilled') locations[id] = location.value.data
    }),
  )
  return { ...doseRoundView({ doses, profiles, locations, now }), shift: await currentShift(now) }
}

// Chỉ số đo trước khi dùng của một khung: [{ code, value }] từ entry.measure { MÃ: 'giá trị' } (BR-M07-26)
const measurementsOf = (entry) =>
  Object.entries(entry.measure ?? {})
    .filter(([, value]) => String(value).trim() !== '')
    .map(([code, value]) => ({ code, value: Number(String(value).replace(',', '.')) }))

// Liều đã Bỏ lỡ vẫn là trạng thái cuối (Q-327): ghi "đã dùng muộn" bằng bản đính chính của api-000, giờ dùng là giờ thực tế
// (BR-M07-26). Cách C trả 202 kèm yêu cầu phê duyệt.
export async function recordLateDose(dose, time, reason, key, now = new Date()) {
  const { status } = await postCorrectionsByRecordTypeByOriginalRecordId({
    path: { recordType: 'M07.DOSE_RESULT', originalRecordId: dose.resultId },
    headers: { 'Idempotency-Key': key },
    body: {
      type: 'AMEND_CONTENT',
      correctedContent: { resultType: 'ADMINISTERED', administeredAt: `${todayVN(now)}T${time}:00+07:00` },
      reason: reason.trim(),
    },
  })
  return status === 202 ? 'pending' : 'saved'
}

// Nhận liều trước khi soạn thuốc, tự hết sau 15 phút; bỏ nhận (BR-M07-26, Q-428)
export const claimDose = (doseKey) =>
  postMedicationDosesByDoseKeyClaim({ path: { doseKey }, headers: { 'Idempotency-Key': crypto.randomUUID() } })
export const releaseDose = (doseKey) =>
  postMedicationDosesByDoseKeyRelease({ path: { doseKey }, headers: { 'Idempotency-Key': crypto.randomUUID() } })

// results: [{ dose, result, time, reaction, reason, measure, key }] từ khung xác nhận; mỗi liều một lệnh, tuần tự để dừng ở lỗi
// đầu tiên (liều đã lưu giữ nguyên, liều chưa lưu còn trong khung).
export async function recordDoses(results, now = new Date()) {
  const day = todayVN(now)
  for (const entry of results) {
    const path = { doseKey: entry.dose.id }
    const headers = { 'Idempotency-Key': entry.key }
    if (entry.result === 'Đã dùng') {
      await postMedicationDosesByDoseKeyAdminister({
        path,
        headers,
        body: {
          administeredAt: `${day}T${entry.time}:00+07:00`,
          basis: entry.dose.status === 'Mang theo' ? 'LEAVE_MEDICATION' : 'REGULAR',
          ...(entry.reaction?.trim() && { adverseReaction: entry.reaction.trim() }),
          ...(measurementsOf(entry).length > 0 && { measurements: measurementsOf(entry) }),
        },
      })
    } else if (entry.result === POSTPONE) {
      await postMedicationDosesByDoseKeyPostpone({ path, headers, body: { reason: entry.reason.trim() } })
    } else if (entry.result === 'Từ chối') {
      await postMedicationDosesByDoseKeyRefuse({ path, headers, body: { reason: entry.reason.trim() } })
    } else {
      await postMedicationDosesByDoseKeySkip({ path, headers, body: { reason: entry.reason.trim() } })
    }
  }
}
