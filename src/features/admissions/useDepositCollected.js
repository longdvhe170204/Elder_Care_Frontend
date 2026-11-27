import { useEffect, useState } from 'react'
import { getContractsByIdDeposit, getResidentsByResidentIdBalance } from '@/api'

// Tiền cọc đã thu (sổ cọc của 017) để bước Đặt cọc ghi "Cần … · đã thu …" (audit BF-01 2026-11-27). Sổ cọc chỉ mở khi hợp
// đồng đầu tiên Chờ ký (Q-225): trước đó backend trả 404, coi là đã thu 0. reload đổi mỗi lần màn tải lại. Không đọc được thì
// null (dòng phụ chỉ ghi khoản cần đặt cọc).
export function useDepositCollected(residentId, reload) {
  const [collected, setCollected] = useState(null)
  useEffect(() => {
    if (!residentId) return
    let active = true
    getResidentsByResidentIdBalance({ path: { residentId } })
      .then(({ data }) => active && setCollected(data.depositBalance ?? 0))
      .catch((e) => active && setCollected(e?.status === 404 ? 0 : null))
    return () => {
      active = false
    }
  }, [residentId, reload])
  return collected
}

// Trạng thái đặt cọc của hợp đồng Chờ ký hoặc Hiệu lực (api-004 GET /contracts/{id}/deposit, do 017 tính): SATISFIED,
// NOT_SATISFIED, NOT_REQUIRED; null khi chưa có hợp đồng đó hoặc không đọc được. Điều kiện ADM_C_DEPOSIT của backend chỉ xét
// hợp đồng Hiệu lực (AdmissionContractConditions), nên khi hợp đồng còn Chờ ký mà đã thu đủ thì bước Đặt cọc dựa vào trạng thái
// này để ghi Xong (chủ dự án báo 2026-11-27); Hoàn tất tiếp nhận vẫn do backend kiểm.
export function useContractDepositStatus(contract, reload) {
  const [status, setStatus] = useState(null)
  const open = ['PENDING_SIGNATURE', 'ACTIVE'].includes(contract?.status)
  const id = open ? contract.id : null
  useEffect(() => {
    if (!id) return
    let active = true
    getContractsByIdDeposit({ path: { id } })
      .then(({ data }) => active && setStatus(data.status ?? null))
      .catch(() => active && setStatus(null))
    return () => {
      active = false
    }
  }, [id, reload])
  return id ? status : null
}
