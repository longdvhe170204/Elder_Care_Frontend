import { getResidentsByIdInitialHealthRecord } from '@/api/api001'
import {
  getMedicationReconciliationWorklist,
  getMedicationReconciliationsById,
  getResidentsByResidentIdMedicationReconciliations,
  postMedicationReconciliationsByIdConfirm,
  postMedicationReconciliationsByIdProposeCorrection,
  postMedicationReconciliationsByIdReturn,
  postMedicationReconciliationsByIdSubmit,
  postResidentsByResidentIdMedicationReconciliations,
  postReconciliationCorrectionsByIdConfirm,
  postReconciliationCorrectionsByIdReturn,
  putMedicationReconciliationsByIdItems,
} from '@/api/api006'
import { loadPrescriptionBoard } from './prescriptions'

// Đọc, ghi phiếu đối chiếu thuốc qua client sinh từ hợp đồng (api-006 reconciliation; api-001 hồ sơ sức khỏe ban đầu).
// Mọi lệnh ghi gửi Idempotency-Key; PUT …/items gửi If-Match là ETag của phiếu (FR-035).

const keyed = (key) => ({ 'Idempotency-Key': key })

export const listReconciliations = (residentId) =>
  getResidentsByResidentIdMedicationReconciliations({ path: { residentId } }).then(({ data }) => data ?? [])

export const getReconciliation = (id) => getMedicationReconciliationsById({ path: { id } })

export const createReconciliation = (residentId, body, key) =>
  postResidentsByResidentIdMedicationReconciliations({ path: { residentId }, headers: keyed(key), body })

export const saveItems = (id, etag, items, key) =>
  putMedicationReconciliationsByIdItems({ path: { id }, headers: { 'If-Match': etag, ...keyed(key) }, body: items })

export const submitReconciliation = (id, key) =>
  postMedicationReconciliationsByIdSubmit({ path: { id }, headers: keyed(key) })

export const confirmReconciliation = (id, key) =>
  postMedicationReconciliationsByIdConfirm({ path: { id }, headers: keyed(key) })

export const returnReconciliation = (id, reason, key) =>
  postMedicationReconciliationsByIdReturn({ path: { id }, headers: keyed(key), body: { reason } })

export const proposeCorrection = (id, body, key) =>
  postMedicationReconciliationsByIdProposeCorrection({ path: { id }, headers: keyed(key), body })

// Xác nhận, trả lại đề nghị đính chính (FR-039; 006 T077): người xác nhận khác người lập, backend kiểm
export const confirmCorrection = (id, key) =>
  postReconciliationCorrectionsByIdConfirm({ path: { id }, headers: keyed(key) })

export const returnCorrection = (id, reason, key) =>
  postReconciliationCorrectionsByIdReturn({ path: { id }, headers: keyed(key), body: { reason } })

// Danh sách "Cần đối chiếu" trong phạm vi người dùng (006 T075, T078)
export const listWorklist = () => getMedicationReconciliationWorklist({}).then(({ data }) => data ?? [])

// Đơn của người cao tuổi, danh mục thuốc, hồ sơ (dị ứng) và "thuốc đang sử dụng khi tiếp nhận" (chữ tự do của 001
// FR-017, chỉ để đọc). Hồ sơ sức khỏe không đọc được thì ghi "chưa có", không chặn phiếu.
export async function loadReconciliationSources(residentId) {
  const [board, health] = await Promise.all([
    loadPrescriptionBoard(residentId),
    getResidentsByIdInitialHealthRecord({ path: { id: residentId } }).then(
      ({ data }) => data?.currentMedications ?? '',
      () => null,
    ),
  ])
  return { ...board, admissionMedications: health }
}
