import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { TransferOutPanel } from './TransferOutPanel'

// 007 T105 (US5; FR-049, FR-050; Q-383, Q-384): đơn vị nhận, thời điểm, người đi cùng bắt buộc; phiếu nguyện vọng có yêu
// cầu hỏi trước thì phải chọn đã hỏi hay chưa, chưa hỏi được (sự cố không Khẩn cấp) thì ghi lý do.

let api

const INFO = { mustAskFirst: true, isEmergency: false, primaryContact: { fullName: 'Lê Văn An', phoneNumber: '0900' } }

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/incidents/11/transfer-out/info', json(200, INFO))
  api.on('POST', '/incidents/11/transfer-out', json(201, { id: 77 }))
  api.on('GET', '/staff', json(200, [{ id: 31, fullName: 'Trần Thu Hà' }]))
})

afterEach(() => vi.unstubAllGlobals())

function fill() {
  fireEvent.change(screen.getByLabelText('Bệnh viện nhận'), { target: { value: 'Bệnh viện A' } })
  // Giờ chuyển khác gập lại, mặc định chuyển ngay (đề xuất 2026-11-24)
  fireEvent.click(screen.getByRole('button', { name: /Đổi giờ, thêm dự kiến về/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Chọn giờ khác' }))
  fireEvent.change(screen.getByLabelText('Giờ chuyển'), { target: { value: '2026-11-09T10:30' } })
  fireEvent.click(screen.getByLabelText('Lê Văn An (người liên hệ chính), 0900'))
  fireEvent.change(screen.getByLabelText('Nhân viên bàn giao'), { target: { value: '31' } })
}

describe('TransferOutPanel', () => {
  it('FR_049_thieuTruongBatBuoc_khongGui', async () => {
    render(<TransferOutPanel incidentId={11} onDone={() => {}} onCancel={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển viện và in phiếu' }))
    expect(await screen.findByText('Nhập bệnh viện nhận')).toBeTruthy()
    expect(screen.getByText('Chọn người đi cùng')).toBeTruthy()
    // lệnh Chuyển viện của 001/004 bắt buộc người bàn giao (quickstart 007 Q55, 2026-11-12)
    expect(screen.getByText('Chọn nhân viên bàn giao')).toBeTruthy()
    expect(api.calls('POST', '/incidents/11/transfer-out')).toHaveLength(0)
  })

  it('Q_383_chuaHoiDuoc_canLyDo_roiGuiKemKey', async () => {
    render(<TransferOutPanel incidentId={11} onDone={() => {}} onCancel={() => {}} />)
    await screen.findByRole('link', { name: '0900' })
    await screen.findByRole('option', { name: 'Trần Thu Hà' })
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Chưa hỏi được' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển viện và in phiếu' }))
    expect(await screen.findByText('Nhập lý do')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Lý do chưa hỏi được'), { target: { value: 'Không gọi được' } })
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển viện và in phiếu' }))

    await waitFor(() => expect(api.calls('POST', '/incidents/11/transfer-out')).toHaveLength(1))
    const [, init] = api.calls('POST', '/incidents/11/transfer-out')[0]
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy()
    expect(JSON.parse(init.body)).toMatchObject({
      transferUnit: 'Bệnh viện A',
      transferAt: '2026-11-09T10:30:00+07:00',
      companion: 'Nhân viên bàn giao của viện; Lê Văn An (người liên hệ chính)',
      handoverStaffId: 31,
      requiredContactReached: false,
      notAskedFirstReason: 'Không gọi được',
    })
    // Xem trước chỉ hiện tờ giấy: không tiêu đề, không dòng hướng dẫn, trình xem PDF ẩn thanh công cụ (BF-06)
    expect(await screen.findByRole('button', { name: 'In phiếu' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Xem trước phiếu/ })).toBeNull()
  })

  it('FR_050h_nguyenVongKhongGuiMacDinh_tichThiGuiIncludeWishes', async () => {
    render(<TransferOutPanel incidentId={11} onDone={() => {}} onCancel={() => {}} />)
    await screen.findByRole('option', { name: 'Trần Thu Hà' })
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Đã hỏi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển viện và in phiếu' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/11/transfer-out')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents/11/transfer-out')[0][1].body).includeWishes).toBeUndefined()
  })

  it('FR_050h_tichGuiKemNguyenVong_guiIncludeWishesTrue', async () => {
    render(<TransferOutPanel incidentId={11} onDone={() => {}} onCancel={() => {}} />)
    await screen.findByRole('option', { name: 'Trần Thu Hà' })
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Đã hỏi' }))
    fireEvent.click(screen.getByLabelText('In kèm nguyện vọng điều trị'))
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển viện và in phiếu' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/11/transfer-out')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents/11/transfer-out')[0][1].body).includeWishes).toBe(true)
  })

  it('Q_384_suCoKhanCap_khongBatLyDo', async () => {
    api.on('GET', '/incidents/11/transfer-out/info', json(200, { ...INFO, isEmergency: true }))
    render(<TransferOutPanel incidentId={11} onDone={() => {}} onCancel={() => {}} />)
    await screen.findByRole('link', { name: '0900' })
    await screen.findByRole('option', { name: 'Trần Thu Hà' })
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Chưa hỏi được' }))
    expect(screen.queryByLabelText('Lý do chưa hỏi được')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển viện và in phiếu' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/11/transfer-out')).toHaveLength(1))
  })
  it('mặc định chuyển ngay: không gửi transferAt; người đi cùng ghép từ nhân viên bàn giao đã chọn', async () => {
    api.on('GET', '/residents/5/handover-staff', json(200, [{ id: 31, fullName: 'Trần Thu Hà', position: 'Điều dưỡng' }]))
    api.on('GET', '/incidents/11/transfer-out/info', json(200, { ...INFO, mustAskFirst: false }))
    render(<TransferOutPanel incidentId={11} residentId={5} onDone={() => {}} onCancel={() => {}} />)
    await screen.findByRole('option', { name: 'Trần Thu Hà (Điều dưỡng)' })
    fireEvent.change(screen.getByLabelText('Bệnh viện nhận'), { target: { value: 'Bệnh viện A' } })
    fireEvent.change(screen.getByLabelText('Nhân viên bàn giao'), { target: { value: '31' } })
    expect(screen.getByText('Nhân viên bàn giao đi cùng: Trần Thu Hà (Điều dưỡng)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển viện và in phiếu' }))

    await waitFor(() => expect(api.calls('POST', '/incidents/11/transfer-out')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/incidents/11/transfer-out')[0][1].body)
    expect(body.transferAt).toBeUndefined()
    expect(body.companion).toBe('Trần Thu Hà (Điều dưỡng), nhân viên bàn giao')
  })

  // BF-06 bước 10: xem nguyện vọng trước khi chuyển; bệnh viện ưu tiên của phiếu nguyện vọng khi điều trị bấm là điền
  it('BF_06_b10_hienNguyenVong_benhVienUuTienBamLaDien', async () => {
    api.on(
      'GET',
      '/incidents/11/transfer-out/info',
      json(200, {
        ...INFO,
        mustAskFirst: false,
        endOfLifeWish: { choice: 'STAY_PALLIATIVE', note: 'Không ép tim' },
        treatmentWish: { preferredHospitals: [{ name: 'Bệnh viện Lão khoa', address: '1A Phương Mai' }] },
      }),
    )
    render(<TransferOutPanel incidentId={11} onDone={() => {}} onCancel={() => {}} />)
    expect(await screen.findByText('Ở lại viện chăm sóc giảm nhẹ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bệnh viện Lão khoa' }))
    expect(screen.getByLabelText('Bệnh viện nhận').value).toBe('Bệnh viện Lão khoa')
  })

  it('người khác đi cùng: bắt nhập tên', async () => {
    render(<TransferOutPanel incidentId={11} onDone={() => {}} onCancel={() => {}} />)
    await screen.findByRole('option', { name: 'Trần Thu Hà' })
    fireEvent.click(screen.getByLabelText('Người khác'))
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển viện và in phiếu' }))
    expect(await screen.findByText('Nhập người đi cùng khác')).toBeTruthy()
    expect(api.calls('POST', '/incidents/11/transfer-out')).toHaveLength(0)
  })
})
