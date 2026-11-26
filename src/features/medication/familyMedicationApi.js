import {
  getResidentsByResidentIdFamilyMedications,
  getResidentsByResidentIdPrescriptions,
  postFamilyMedicationsByIdConfirmUse,
  postFamilyMedicationsByIdDispose,
  postFamilyMedicationsByIdHoldOnly,
  postFamilyMedicationsByIdMarkDepleted,
  postFamilyMedicationsByIdNotifyRunningLow,
  postFamilyMedicationsByIdReturn,
  postFamilyMedicationsByIdStopUse,
  postResidentsByResidentIdFamilyMedications,
} from '@/api/api006'

// Thuốc gia đình gửi (spec 006 US5; FR-040 → FR-046, BR-M07-10, 11, 19, 30): tiếp nhận kèm kiểm tra, xác nhận sử dụng
// gắn đơn nguồn gia đình gửi, giữ hộ, hoàn trả, hủy kèm người chứng kiến. Không theo dõi số lượng còn (Q-393).

export const STATUS = {
  PENDING_RECONCILIATION: 'Chờ đối chiếu',
  IN_USE: 'Được sử dụng',
  HOLD_ONLY: 'Chỉ giữ hộ',
  DEPLETED: 'Đã dùng hết',
  RETURNED: 'Đã hoàn trả',
  DISPOSED: 'Đã hủy',
}
export const DISPOSE_KIND = { FAMILY_REQUEST: 'theo yêu cầu gia đình', EXPIRED: 'do hết hạn dùng' }
export const CHECKS = [
  ['labelOk', 'Nhãn thuốc'],
  ['expiryOk', 'Hạn dùng'],
  ['packagingOk', 'Bao bì'],
  ['nameOk', 'Đúng tên người cao tuổi'],
]
export const EXTRA_CHECKS = [
  ['ingredientOk', 'Đúng hoạt chất'],
  ['concentrationOk', 'Đúng hàm lượng'],
  ['dosageFormOk', 'Đúng dạng thuốc'],
  ['storageOk', 'Điều kiện bảo quản đạt'],
]

export async function loadFamilyMedications(residentId) {
  const [batches, prescriptions] = await Promise.all([
    getResidentsByResidentIdFamilyMedications({ path: { residentId } }),
    getResidentsByResidentIdPrescriptions({ path: { residentId }, query: { status: ['ACTIVE', 'SUSPENDED', 'PENDING_EFFECTIVE'] } }),
  ])
  return {
    batches: batches.data ?? [],
    prescriptions: (prescriptions.data ?? []).filter((p) => p.medicationSource === 'FAMILY_SENT'),
  }
}

const headers = (key) => ({ 'Idempotency-Key': key })

export const receiveBatch = (residentId, body, key) =>
  postResidentsByResidentIdFamilyMedications({ path: { residentId }, headers: headers(key), body })

// Lô ghi tự do phải chọn thuốc khi xác nhận (api-006 confirm-use): lấy thuốc của đơn đầu tiên được chọn
export const confirmUse = (batch, prescriptions, selected, packagingRecognizable, key) =>
  postFamilyMedicationsByIdConfirmUse({
    path: { id: batch.id },
    headers: headers(key),
    body: {
      prescriptionIds: selected,
      packagingRecognizable,
      ...(!batch.medicationId && { medicationId: prescriptions.find((p) => p.id === selected[0])?.medicationId }),
    },
  })

export const holdOnly = (id, reason, key) =>
  postFamilyMedicationsByIdHoldOnly({ path: { id }, headers: headers(key), body: { reason: reason.trim() } })
export const stopUse = (id, reason, key) =>
  postFamilyMedicationsByIdStopUse({ path: { id }, headers: headers(key), body: { reason: reason.trim() } })
export const markDepleted = (id, key) => postFamilyMedicationsByIdMarkDepleted({ path: { id }, headers: headers(key) })
export const notifyRunningLow = (id, note, key) =>
  postFamilyMedicationsByIdNotifyRunningLow({ path: { id }, headers: headers(key), body: { ...(note?.trim() && { note: note.trim() }) } })

// Hoàn trả cả lô: số đếm thực tế, người nhận, người chứng kiến (BR-M07-19, BR-M07-30)
export const returnBatch = (id, form, key) =>
  postFamilyMedicationsByIdReturn({
    path: { id },
    headers: headers(key),
    body: {
      quantity: Number(form.quantity),
      recipient: { type: 'FAMILY_MEMBER', fullName: form.recipient.trim(), ...(form.relationship.trim() && { relationship: form.relationship.trim() }) },
      returnedAt: new Date().toISOString(),
      witness: form.witness.trim(),
    },
  })

// Hủy cả lô: theo yêu cầu gia đình (cần người đại diện, hình thức) hoặc do hết hạn dùng (BR-M07-19, BR-M07-30)
export const disposeBatch = (id, form, key) =>
  postFamilyMedicationsByIdDispose({
    path: { id },
    headers: headers(key),
    body: {
      quantity: Number(form.quantity),
      kind: form.kind,
      ...(form.kind === 'FAMILY_REQUEST' && { representativeId: Number(form.representativeId), requestMethod: form.requestMethod.trim() }),
      witness: form.witness.trim(),
      reason: form.reason.trim(),
    },
  })
