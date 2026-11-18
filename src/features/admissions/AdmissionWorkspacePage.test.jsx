import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AdmissionWorkspacePage } from './AdmissionWorkspacePage'

// Hồ sơ tiếp nhận (chủ dự án duyệt 2026-11-17, đề xuất A): một màn cho một lượt tiếp nhận theo BF-01; trạng thái từng
// bước lấy từ tiến trình và điều kiện của 004 (FR-003, FR-004), nút mở đúng form hoặc màn đang có. Màn chỉ hiện trạng
// thái đã ghi, không tự làm bước thay người (Q-306, Q-307).

let api

const APPLICATION = {
  id: 7,
  residentId: 5,
  applicationDate: '2026-11-12',
  desiredResidenceType: 'LONG_TERM_RESIDENTIAL',
  expectedCareLevel: 'REGULAR',
  desiredAdmissionDate: '2026-11-20',
  status: 'IN_PROGRESS',
  admissionOpinion: [],
}

const CONDITIONS = {
  conditions: [
    { code: 'ADM_A_ASSESSMENT', name: 'Đánh giá đầu vào còn hạn', status: 'MET' },
    { code: 'ADM_B_CONTRACT', name: 'Hợp đồng Hiệu lực', status: 'NOT_MET' },
    { code: 'ADM_C_DEPOSIT', name: 'Đặt cọc', status: 'NOT_MET' },
    { code: 'ADM_D_BED', name: 'Giường đã về Trống', status: 'MET' },
    { code: 'ADM_E_CONTRACT_LEVEL', name: 'Mức hợp đồng trùng mức đánh giá', status: 'MET' },
    { code: 'ADM_F_CONTACTS', name: 'Liên hệ chính, người đại diện', status: 'MET' },
  ],
  warnings: [],
  admissionOpinion: {
    id: 1,
    opinion: 'AGREE',
    source: { type: 'RESIDENT' },
    recordedAt: '2026-11-12T03:00:00Z',
  },
}

const PROGRESS = {
  steps: [
    { name: 'APPLICATION', done: true },
    { name: 'INFORMATION_COLLECTION', done: true },
    { name: 'ASSESSMENT', done: true },
    { name: 'RESIDENCE_TYPE_DETERMINATION', done: true },
    { name: 'CARE_DETERMINATION', done: true },
    { name: 'SERVICE_DETERMINATION', done: false },
    { name: 'CONDITION_CHECK', done: false },
    { name: 'ADMISSION', done: false },
  ],
}

beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/me/permissions',
    json(200, [
      { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
      { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'CREATE' },
    ]),
  )
  api.on('GET', '/admission-applications/7', json(200, APPLICATION, { ETag: '"2"' }))
  api.on('GET', '/admission-applications/7/admission-conditions', json(200, CONDITIONS))
  api.on('GET', '/admission-applications/7/progress', json(200, PROGRESS))
  api.on(
    'GET',
    '/residents/5',
    json(200, {
      id: 5,
      profileCode: 'NCT-2026-009003',
      status: 'ADMISSION_IN_PROGRESS',
      personalInfo: { fullName: 'Lê Thị Cúc' },
      allowedCommands: ['COMPLETE_ADMISSION'],
    }),
  )
  api.on('GET', '/contracts', json(200, []))
  api.on('GET', '/residents/5/medication-reconciliations', json(200, []))
})

function renderPage(onNavigate = vi.fn()) {
  render(
    <PermissionsProvider>
      <AdmissionWorkspacePage id={7} onNavigate={onNavigate} />
    </PermissionsProvider>,
  )
  return onNavigate
}

describe('AdmissionWorkspacePage', () => {
  it('đầu màn có họ tên, trạng thái và tiến độ theo tiến trình của 004', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Tiếp nhận Lê Thị Cúc' })).toBeTruthy()
    expect(screen.getByText('5 / 8 bước đã xong')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Tiến độ tiếp nhận' })).toHaveAttribute('aria-valuenow', '5')
  })

  it('các bước chia theo giai đoạn, mỗi bước mang trạng thái của điều kiện tương ứng', async () => {
    renderPage()

    const steps = await screen.findByRole('list', { name: 'Các bước tiếp nhận' })
    expect(within(steps).getByText('Giường, hợp đồng, đặt cọc')).toBeTruthy()
    const contract = within(steps).getByRole('listitem', { name: /Hợp đồng/ })
    expect(within(contract).getByText('Chưa đạt')).toBeTruthy()
    const bed = within(steps).getByRole('listitem', { name: /Phân bổ giường/ })
    expect(within(bed).getByText('Đạt')).toBeTruthy()
  })

  it('cột điều kiện Hoàn tất đếm điều kiện chưa đạt và hiện ý kiến về việc vào ở', async () => {
    renderPage()

    const panel = await screen.findByRole('region', { name: 'Điều kiện Hoàn tất tiếp nhận' })
    expect(within(panel).getByText('Còn 2 điều kiện chưa đạt')).toBeTruthy()
    expect(within(panel).getByText(/Đồng ý/)).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Hoàn tất tiếp nhận' })).toBeTruthy()
  })

  it('chưa có hợp đồng thì nút Lập hợp đồng; người thân và đặt cọc mở màn sở hữu', async () => {
    const onNavigate = renderPage()

    expect(await screen.findByRole('button', { name: 'Lập hợp đồng' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mở Người thân và quyền' }))
    expect(onNavigate).toHaveBeenCalledWith('family-members')
    fireEvent.click(screen.getByRole('button', { name: 'Mở Số dư, thu chi' }))
    expect(onNavigate).toHaveBeenCalledWith('balance')
  })

  it('006 T073: bước đối chiếu thuốc chưa lập phiếu, không có quyền thì không có nút mở', async () => {
    renderPage()

    const step = await screen.findByRole('listitem', { name: /Phiếu đối chiếu thuốc/ })
    expect(within(step).getByText('Chưa lập phiếu')).toBeTruthy()
    expect(within(step).getByText('Không chặn Hoàn tất tiếp nhận')).toBeTruthy()
    expect(within(step).queryByRole('button')).toBeNull()
  })

  it('006 T073: bước đối chiếu thuốc lấy trạng thái phiếu tiếp nhận, nút mở khung đối chiếu', async () => {
    api.on(
      'GET',
      '/me/permissions',
      json(200, [{ function: 'MEDICATION_RECONCILIATION', operation: 'VIEW' }]),
    )
    api.on(
      'GET',
      '/residents/5/medication-reconciliations',
      json(200, [{ id: 4, residentId: 5, reason: 'ADMISSION', status: 'PENDING_CONFIRMATION', items: [], allowedCommands: [] }]),
    )
    renderPage()

    const step = await screen.findByRole('listitem', { name: /Phiếu đối chiếu thuốc/ })
    expect(within(step).getByText('Chờ xác nhận')).toBeTruthy()
    fireEvent.click(await within(step).findByRole('button', { name: 'Mở đối chiếu thuốc' }))
    expect(await screen.findByRole('heading', { name: 'Đối chiếu thuốc khi tiếp nhận' })).toBeTruthy()
  })

  it('quay lại danh sách đăng ký tiếp nhận', async () => {
    const onNavigate = renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Danh sách đăng ký' }))
    expect(onNavigate).toHaveBeenCalledWith('admission-applications')
  })
})
