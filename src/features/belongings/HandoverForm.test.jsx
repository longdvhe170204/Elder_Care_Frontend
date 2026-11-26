import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { HandoverForm } from './HandoverForm'

const LEVELS = [
  { id: 11, name: 'Nguyên vẹn', order: 1, unusable: false, status: 'ACTIVE' },
  { id: 12, name: 'Trầy xước', order: 2, unusable: false, status: 'ACTIVE' },
]
const LOCATIONS = [{ id: 21, name: 'Kho tầng 2', status: 'ACTIVE' }]
const CLOTHES = { id: 90, description: 'Áo len', quantity: 5, status: 'HELD', holder: 'STAFF', version: 3 }

function renderForm(belonging = CLOTHES, onDone = vi.fn(), lastLevelId) {
  render(
    <HandoverForm
      belonging={belonging}
      levels={LEVELS}
      locations={LOCATIONS}
      lastLevelId={lastLevelId}
      onDone={onDone}
    />,
  )
  return onDone
}

const sent = (api) => {
  const [, init] = api.calls('POST', '/belongings/handovers')[0]
  return { body: JSON.parse(init.body), headers: init.headers }
}

describe('HandoverForm (013 T015, US2)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('BR_M12_01_lenhTheoTrangThaiDo', () => {
    mockRoutes()
    renderForm()
    const options = within(screen.getByLabelText('Lệnh bàn giao'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Chọn…', 'Giao sử dụng', 'Chuyển giữ', 'Báo thất lạc', 'Ghi hư hỏng'])
  })

  it('FR_012_giaoMotPhan_guiSoLuongVaPhienBan', async () => {
    const api = mockRoutes()
    api.on('POST', '/belongings/handovers', json(200, { handovers: [], belongings: [] }))
    const onDone = renderForm()
    fireEvent.change(screen.getByLabelText('Lệnh bàn giao'), { target: { value: 'GIVE_FOR_USE' } })
    fireEvent.change(screen.getByLabelText('Số lượng bàn giao'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const { body, headers } = sent(api)
    expect(body.type).toBe('GIVE_FOR_USE')
    expect(body.items).toEqual([{ belongingId: 90, version: 3, quantity: 2 }])
    expect(body.at).toMatch(/\+07:00$/)
    expect(headers['Idempotency-Key']).toBeTruthy()
  })

  it('FR_021_baoThatLac_lyDoBatBuoc_suCoMoi', async () => {
    const api = mockRoutes()
    api.on('POST', '/belongings/handovers', json(200, { handovers: [], belongings: [] }))
    const onDone = renderForm()
    fireEvent.change(screen.getByLabelText('Lệnh bàn giao'), { target: { value: 'REPORT_LOST' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))
    expect(await screen.findByText('Nhập lý do.')).toBeInTheDocument()
    expect(api.calls('POST', '/belongings/handovers')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Không thấy trong tủ' } })
    fireEvent.change(screen.getByLabelText('Sự cố'), { target: { value: 'NEW' } })
    fireEvent.change(screen.getByLabelText('Mức sự cố'), { target: { value: 'MEDIUM' } })
    fireEvent.change(screen.getByLabelText('Số đếm được'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const { body } = sent(api)
    expect(body).toMatchObject({ type: 'REPORT_LOST', reason: 'Không thấy trong tủ' })
    expect(body.items[0]).toMatchObject({ countedQuantity: 0, incident: { method: 'NEW', level: 'MEDIUM' } })
  })

  it('FR_015_chenhLechTinhTrang_chonXuLy_nguoiGiuVangMat', async () => {
    const api = mockRoutes()
    api.on('POST', '/belongings/handovers', json(200, { handovers: [], belongings: [] }))
    const onDone = renderForm()
    fireEvent.change(screen.getByLabelText('Lệnh bàn giao'), { target: { value: 'TRANSFER_CUSTODY' } })
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Chuyển kho' } })
    fireEvent.change(screen.getByLabelText('Vị trí lưu giữ mới'), { target: { value: '21' } })
    fireEvent.change(screen.getByLabelText('Mức tình trạng lúc bàn giao'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Xử lý chênh lệch tình trạng'), { target: { value: 'ACKNOWLEDGE' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Người đang giữ vắng mặt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const { body } = sent(api)
    expect(body).toMatchObject({
      type: 'TRANSFER_CUSTODY',
      storageLocationId: 21,
      conditionHandling: 'ACKNOWLEDGE',
      holderAbsent: true,
    })
    expect(body.items[0].condition).toEqual({ levelId: 12 })
  })

  // BF-14 test web 2026-11-22: trước đây chỉ biết phải chọn xử lý sau khi backend chặn
  it('FR_015_hienChenhLechSoVoiLanTruoc_batChonXuLyTruocKhiGui', async () => {
    const api = mockRoutes()
    api.on('POST', '/belongings/handovers', json(200, { handovers: [], belongings: [] }))
    const onDone = renderForm(CLOTHES, vi.fn(), 11)
    fireEvent.change(screen.getByLabelText('Lệnh bàn giao'), { target: { value: 'GIVE_FOR_USE' } })
    fireEvent.change(screen.getByLabelText('Mức tình trạng lúc bàn giao'), { target: { value: '11' } })
    expect(screen.queryByLabelText('Xử lý chênh lệch tình trạng')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Mức tình trạng lúc bàn giao'), { target: { value: '12' } })
    expect(screen.getByText(/Nguyên vẹn → Trầy xước/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))
    expect(await screen.findByText('Chọn cách xử lý chênh lệch tình trạng.')).toBeInTheDocument()
    expect(api.calls('POST', '/belongings/handovers')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Xử lý chênh lệch tình trạng'), { target: { value: 'ACKNOWLEDGE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(sent(api).body.conditionHandling).toBe('ACKNOWLEDGE')
  })

  // BF-14 test web 2026-11-22: loại sự cố đồ gửi mặc định Trung bình, chọn Nhẹ phải ghi lý do (007 FR-042)
  it('FR_023_suCoMoiMucNhe_batBuocLyDoChonMucThap', async () => {
    const api = mockRoutes()
    api.on('POST', '/belongings/handovers', json(200, { handovers: [], belongings: [] }))
    const onDone = renderForm()
    fireEvent.change(screen.getByLabelText('Lệnh bàn giao'), { target: { value: 'REPORT_LOST' } })
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Không thấy trong tủ' } })
    fireEvent.change(screen.getByLabelText('Sự cố'), { target: { value: 'NEW' } })
    fireEvent.change(screen.getByLabelText('Mức sự cố'), { target: { value: 'LOW' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))
    expect(await screen.findByText('Nhập lý do chọn mức thấp hơn mặc định.')).toBeInTheDocument()
    expect(api.calls('POST', '/belongings/handovers')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Lý do chọn mức thấp hơn mặc định'), {
      target: { value: 'Đồ giá trị thấp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(sent(api).body.items[0].incident).toEqual({
      method: 'NEW',
      level: 'LOW',
      lowerLevelReason: 'Đồ giá trị thấp',
    })
  })

  it('FR_008_ghiHuHong_dienSanViTriHienTai_batBuocAnh_noiDungGuiDuViTri', async () => {
    const api = mockRoutes()
    api.on('POST', '/files', json(201, { fileId: 720 }))
    api.on('POST', '/belongings/handovers', json(200, { handovers: [], belongings: [] }))
    const onDone = renderForm({ ...CLOTHES, storageLocationId: 21 })
    fireEvent.change(screen.getByLabelText('Lệnh bàn giao'), { target: { value: 'RECORD_DAMAGE' } })
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Bị mốc' } })
    expect(screen.getByLabelText('Vị trí lưu giữ mới')).toHaveValue('21')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))
    expect(await screen.findByText('Chọn ít nhất một ảnh.')).toBeInTheDocument()
    expect(api.calls('POST', '/belongings/handovers')).toHaveLength(0)

    const png = new File(['x'], 'hu-hong.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Ảnh lúc bàn giao'), { target: { files: [png] } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const { body } = sent(api)
    expect(body).toMatchObject({ type: 'RECORD_DAMAGE', storageLocationId: 21 })
    expect(body.items[0].photoFileIds).toEqual([720])
    expect(body.items[0].incident).toBeUndefined()
  })

  it('FR_008_ghiHuHong_doChuaCoViTri_phaiChonViTri', async () => {
    mockRoutes()
    renderForm({ ...CLOTHES, storageLocationId: undefined })
    fireEvent.change(screen.getByLabelText('Lệnh bàn giao'), { target: { value: 'RECORD_DAMAGE' } })
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Bị mốc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))
    expect(await screen.findByText('Chọn vị trí lưu giữ.')).toBeInTheDocument()
  })

  it('FR_011b_409_hienLyDo', async () => {
    const api = mockRoutes()
    api.on('POST', '/belongings/handovers', problem(409, 'STATE_CHANGED', { detail: 'Đồ đã thay đổi, tải lại.' }))
    renderForm()
    fireEvent.change(screen.getByLabelText('Lệnh bàn giao'), { target: { value: 'GIVE_FOR_USE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bàn giao' }))
    expect(await screen.findByText('Đồ đã thay đổi, tải lại.')).toBeInTheDocument()
  })
})

// Demo 2026-11-25: bàn giao tiền mặt, ô số tiền dạng xxx.xxx.xxx đ
it('banGiaoTienMat_oSoTienDinhDang', () => {
  renderForm({ id: 92, description: 'Tiền mặt', cashAmount: 2000000, status: 'HELD', holder: 'STAFF', version: 1 })
  fireEvent.change(screen.getByLabelText('Số tiền bàn giao (trống là toàn bộ)'), { target: { value: '500000' } })
  expect(screen.getByLabelText('Số tiền bàn giao (trống là toàn bộ)')).toHaveValue('500.000')
})
