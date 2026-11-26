import { expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as api from '@/api'
import { PurchaseRequests } from './PurchaseRequests'
import { uploadFile } from '@/common/files'

const permissions = vi.hoisted(() => ({ operations: ['VIEW', 'APPROVE'] }))
vi.mock('@/common/files', () => ({ uploadFile: vi.fn() }))

vi.mock('@/api', async (importOriginal) => ({
  ApiError: (await importOriginal()).ApiError,
  getPurchaseAssistanceRequests: vi.fn(),
  postPurchaseAssistanceRequests: vi.fn(),
  postPurchaseAssistanceRequestsByIdAgree: vi.fn(),
  postPurchaseAssistanceRequestsByIdReject: vi.fn(),
  postPurchaseAssistanceRequestsByIdSend: vi.fn(),
  postPurchaseAssistanceRequestsByIdCancel: vi.fn(),
  postPurchaseAssistanceRequestsByIdRequestAdditionalConsent: vi.fn(),
  postPurchaseAssistanceRequestsByIdWithdrawAdditionalConsent: vi.fn(),
  postPurchaseAssistanceRequestsByIdRecordPurchased: vi.fn(),
  // Demo 2026-11-25: người cao tuổi, người yêu cầu, vật phẩm chọn theo tên thay cho ô nhập mã
  getResidents: vi.fn(),
  getStaff: vi.fn(),
  getServices: vi.fn(),
  getResidentsByResidentIdFamilyContacts: vi.fn(),
}))
vi.mock('@/common/permissions/permissions', () => ({
  usePermissions: () => ({ status: 'ready', can: (_f, op) => permissions.operations.includes(op) }),
}))
beforeEach(() => {
  vi.clearAllMocks()
  permissions.operations = ['VIEW', 'APPROVE']
  api.getResidents.mockResolvedValue({
    data: { items: [{ id: 7, profileCode: 'NCT-0007', personalInfo: { fullName: 'Nguyễn Thị Lan' } }] },
  })
  api.getStaff.mockResolvedValue({
    data: [
      { id: 55, fullName: 'Phạm Văn Bác', position: 'Bác sĩ' },
      { id: 3, fullName: 'Lê Thị Dưỡng', position: 'Điều dưỡng' },
      { id: 4, fullName: 'Trần Văn Bếp', position: 'Nhân viên bếp' },
    ],
  })
  api.getServices.mockResolvedValue({
    data: [
      { id: 12, name: 'Băng cuộn y tế', type: 'MEDICAL_SUPPLY', status: 'ACTIVE' },
      { id: 13, name: 'Vật tư đã ngừng', type: 'MEDICAL_SUPPLY', status: 'INACTIVE' },
    ],
  })
  api.getResidentsByResidentIdFamilyContacts.mockResolvedValue({
    data: [{ familyMemberId: 41, fullName: 'Trần Văn Minh' }],
  })
  api.getPurchaseAssistanceRequests.mockResolvedValue({
    data: [
      {
        id: 9,
        residentId: 7,
        description: 'Đồ dùng cá nhân',
        quantity: 1,
        estimatedAmount: 800000,
        status: 'AWAITING_CONSENT',
        decisions: [],
      },
    ],
  })
  api.postPurchaseAssistanceRequestsByIdAgree.mockResolvedValue({})
})

it('FR_024_uploadsReceiptOnceAndKeepsIdempotencyKeyWhenRetrying', async () => {
  permissions.operations = ['VIEW', 'UPDATE']
  api.getPurchaseAssistanceRequests.mockResolvedValue({
    data: [
      {
        id: 9,
        residentId: 7,
        description: 'Đồ dùng cá nhân',
        quantity: 1,
        estimatedAmount: 300000,
        allowedAmount: 300000,
        status: 'PURCHASE_ALLOWED',
        decisions: [],
      },
    ],
  })
  uploadFile.mockResolvedValue(41)
  api.postPurchaseAssistanceRequestsByIdRecordPurchased.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({})
  render(<PurchaseRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Xem đề nghị #9' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ghi đã mua' }))
  fireEvent.change(screen.getByLabelText('Số tiền (bắt buộc)'), { target: { value: '300000' } })
  fireEvent.change(screen.getByLabelText('Ngày mua (bắt buộc)'), { target: { value: '2026-11-08' } })
  const file = new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Chứng từ (bắt buộc)'), { target: { files: [file] } })
  fireEvent.submit(screen.getByRole('button', { name: 'Xác nhận ghi đã mua' }).closest('form'))
  await waitFor(() => expect(api.postPurchaseAssistanceRequestsByIdRecordPurchased).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận ghi đã mua' })).not.toBeDisabled())
  fireEvent.submit(screen.getByRole('button', { name: 'Xác nhận ghi đã mua' }).closest('form'))
  await waitFor(() => expect(api.postPurchaseAssistanceRequestsByIdRecordPurchased).toHaveBeenCalledTimes(2))
  expect(uploadFile).toHaveBeenCalledExactlyOnceWith(file)
  const [first, retry] = api.postPurchaseAssistanceRequestsByIdRecordPurchased.mock.calls
  expect(first[0]).toEqual(retry[0])
  expect(first[0].body).toEqual({ actualAmount: 300000, purchasedOn: '2026-11-08', receiptFileId: 41 })
})

it('FR_023_conflictReloadsAndDoesNotAnnounceSuccessfulDecision', async () => {
  api.postPurchaseAssistanceRequestsByIdAgree.mockRejectedValue({ status: 409 })
  render(<PurchaseRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Xem đề nghị #9' }))
  fireEvent.click(screen.getByRole('button', { name: 'Đồng ý' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đồng ý' }))
  await waitFor(() => expect(api.getPurchaseAssistanceRequests).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('status')).toHaveTextContent('Đề nghị đã thay đổi')
})
it('FR_023_requiresReviewBeforeConsentAndReloadsAfterDecision', async () => {
  render(<PurchaseRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Xem đề nghị #9' }))
  fireEvent.click(screen.getByRole('button', { name: 'Đồng ý' }))
  expect(api.postPurchaseAssistanceRequestsByIdAgree).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đồng ý' }))
  await waitFor(() =>
    expect(api.postPurchaseAssistanceRequestsByIdAgree).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: 9 }, headers: { 'Idempotency-Key': expect.any(String) } }),
    ),
  )
  await waitFor(() => expect(api.getPurchaseAssistanceRequests).toHaveBeenCalledTimes(2))
})
it('Q_269_urgentPurchaseSendsRequesterOnlyWhenChecked', async () => {
  permissions.operations = ['VIEW', 'UPDATE']
  api.getPurchaseAssistanceRequests.mockResolvedValue({
    data: [
      {
        id: 9,
        residentId: 7,
        catalogItemId: 12,
        description: 'Vật tư y tế',
        quantity: 1,
        estimatedAmount: 800000,
        allowedAmount: 800000,
        status: 'PURCHASE_ALLOWED',
        decisions: [],
      },
    ],
  })
  uploadFile.mockResolvedValue(41)
  api.postPurchaseAssistanceRequestsByIdRecordPurchased.mockResolvedValue({})
  render(<PurchaseRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Xem đề nghị #9' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ghi đã mua' }))
  fireEvent.change(screen.getByLabelText('Số tiền (bắt buộc)'), { target: { value: '1000000' } })
  fireEvent.change(screen.getByLabelText('Ngày mua (bắt buộc)'), { target: { value: '2026-11-08' } })
  fireEvent.change(screen.getByLabelText('Chứng từ (bắt buộc)'), {
    target: { files: [new File(['r'], 'r.pdf', { type: 'application/pdf' })] },
  })
  fireEvent.click(screen.getByLabelText('Mua gấp thuốc, vật tư y tế'))
  await screen.findByRole('option', { name: 'Phạm Văn Bác (Bác sĩ)' })
  expect(screen.queryByRole('option', { name: /Trần Văn Bếp/ })).toBeNull()
  fireEvent.change(screen.getByLabelText('Bác sĩ hoặc Điều dưỡng yêu cầu (bắt buộc)'), {
    target: { value: '55' },
  })
  fireEvent.submit(screen.getByRole('button', { name: 'Xác nhận ghi đã mua' }).closest('form'))
  await waitFor(() =>
    expect(api.postPurchaseAssistanceRequestsByIdRecordPurchased.mock.calls[0][0].body).toEqual({
      actualAmount: 1000000,
      purchasedOn: '2026-11-08',
      receiptFileId: 41,
      urgentPurchase: true,
      urgentPurchaseRequesterId: 55,
    }),
  )
})

it('Q_269_urgentOptionIsHiddenForRequestsOutsideCatalog', async () => {
  permissions.operations = ['VIEW', 'UPDATE']
  api.getPurchaseAssistanceRequests.mockResolvedValue({
    data: [
      {
        id: 9,
        residentId: 7,
        description: 'Đồ dùng cá nhân',
        quantity: 1,
        estimatedAmount: 300000,
        allowedAmount: 300000,
        status: 'PURCHASE_ALLOWED',
        decisions: [],
      },
    ],
  })
  render(<PurchaseRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Xem đề nghị #9' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ghi đã mua' }))
  expect(screen.queryByLabelText('Mua gấp thuốc, vật tư y tế')).not.toBeInTheDocument()
})

it('T025_createSendsCatalogItemWhenGiven', async () => {
  permissions.operations = ['VIEW', 'CREATE']
  api.postPurchaseAssistanceRequests.mockResolvedValue({})
  render(<PurchaseRequests residentId={7} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Lập đề nghị mua hộ' }))
  await screen.findByRole('option', { name: 'Băng cuộn y tế' })
  expect(screen.queryByRole('option', { name: 'Vật tư đã ngừng' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Vật phẩm trong danh mục (nếu có)'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('Mô tả mục cần mua (bắt buộc)'), { target: { value: 'Băng cuộn' } })
  fireEvent.change(screen.getByLabelText('Số lượng (bắt buộc)'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Số tiền dự kiến (bắt buộc)'), { target: { value: '50000' } })
  expect(screen.getByLabelText('Số tiền dự kiến (bắt buộc)')).toHaveValue('50.000')
  await screen.findByRole('option', { name: 'Lê Thị Dưỡng (Điều dưỡng)' })
  fireEvent.change(screen.getByLabelText('Nhân viên yêu cầu (bắt buộc)'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Lý do (bắt buộc)'), { target: { value: 'Bác sĩ chỉ định' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu đề nghị nháp' }))
  await waitFor(() =>
    expect(api.postPurchaseAssistanceRequests.mock.calls[0][0].body).toEqual(
      expect.objectContaining({
        residentId: 7,
        catalogItemId: 12,
        description: 'Băng cuộn',
        requester: { type: 'STAFF', id: 3 },
      }),
    ),
  )
})

it('FR_023_rejectionRequiresReasonAnd403ClearsPrivateData', async () => {
  api.postPurchaseAssistanceRequestsByIdReject.mockRejectedValue({ status: 403 })
  render(<PurchaseRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Xem đề nghị #9' }))
  fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }))
  expect(screen.getByRole('button', { name: 'Xác nhận từ chối' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Lý do (bắt buộc)'), { target: { value: 'Không còn nhu cầu' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }))
  await waitFor(() => expect(screen.queryByText('Đồ dùng cá nhân')).not.toBeInTheDocument())
})

// Demo 2026-11-25: người thân yêu cầu chọn theo tên trong người thân của người cao tuổi đã chọn
it('taoDeNghi_nguoiThanYeuCau_chonTheoTen', async () => {
  permissions.operations = ['VIEW', 'CREATE']
  api.postPurchaseAssistanceRequests.mockResolvedValue({})
  render(<PurchaseRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Lập đề nghị mua hộ' }))
  expect(screen.queryByLabelText('Mã người cao tuổi (bắt buộc)')).toBeNull()
  await screen.findByRole('option', { name: 'Nguyễn Thị Lan (NCT-0007)' })
  fireEvent.change(screen.getByLabelText('Người cao tuổi (bắt buộc)'), { target: { value: '7' } })
  fireEvent.change(screen.getByLabelText('Mô tả mục cần mua (bắt buộc)'), { target: { value: 'Áo ấm' } })
  fireEvent.change(screen.getByLabelText('Số lượng (bắt buộc)'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Số tiền dự kiến (bắt buộc)'), { target: { value: '200000' } })
  fireEvent.change(screen.getByLabelText('Người yêu cầu'), { target: { value: 'FAMILY_MEMBER' } })
  await screen.findByRole('option', { name: 'Trần Văn Minh' })
  fireEvent.change(screen.getByLabelText('Người thân yêu cầu (bắt buộc)'), { target: { value: '41' } })
  fireEvent.change(screen.getByLabelText('Lý do (bắt buộc)'), { target: { value: 'Trời lạnh' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu đề nghị nháp' }))
  await waitFor(() =>
    expect(api.postPurchaseAssistanceRequests.mock.calls[0][0].body).toEqual(
      expect.objectContaining({ residentId: 7, requester: { type: 'FAMILY_MEMBER', id: 41 } }),
    ),
  )
})

it('taoDeNghi_chuaChonNguoiYeuCau_baoLoi_khongGui', async () => {
  permissions.operations = ['VIEW', 'CREATE']
  render(<PurchaseRequests residentId={7} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Lập đề nghị mua hộ' }))
  fireEvent.submit(screen.getByRole('button', { name: 'Lưu đề nghị nháp' }).closest('form'))
  expect(await screen.findByText('Chọn người cao tuổi và người yêu cầu.')).toBeInTheDocument()
  expect(api.postPurchaseAssistanceRequests).not.toHaveBeenCalled()
})
