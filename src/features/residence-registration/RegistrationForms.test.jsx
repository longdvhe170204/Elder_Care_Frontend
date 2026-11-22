import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { RegistrationForm } from './RegistrationForms'

// Form lệnh trên khai báo (018 T008, T010, T014; api-018 {command}, bố cục K4, K7).

const REGISTRATION = { id: 7, residentId: 5, type: 'TEMPORARY_RESIDENCE_REGISTRATION', status: 'TO_SUBMIT' }
const NOTICE = { ...REGISTRATION, type: 'STAY_NOTIFICATION' }
const pdf = () => new File(['k'], 'ket-qua.pdf', { type: 'application/pdf' })
const photo = () => new File(['k'], 'da-tiep-nhan.jpg', { type: 'image/jpeg' })

function renderForm(form, registration = REGISTRATION, allowed = []) {
  const onDone = vi.fn()
  render(
    <RegistrationForm
      form={form}
      registration={{ ...registration, allowedCommands: allowed }}
      onDone={onDone}
      onCancel={vi.fn()}
    />,
  )
  return onDone
}

const bodyOf = (api, command) => JSON.parse(api.calls('POST', `/residence-registrations/7/${command}`)[0][1].body)

describe('RegistrationForm (018)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('FR_001_xacNhanThuongTruCungXa_batBuocCanCu_guiBasisNote', async () => {
    const api = mockRoutes()
    api.on('POST', '/residence-registrations/7/confirm-local-permanent-resident', json(200, {}))
    const onDone = renderForm('confirm-local')
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thường trú' }))
    expect(await screen.findByText('Nhập căn cứ xác nhận thường trú cùng xã/phường.')).toBeInTheDocument()
    expect(api.fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Căn cứ'), { target: { value: 'Sổ hộ khẩu cùng phường' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thường trú' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const [, init] = api.calls('POST', '/residence-registrations/7/confirm-local-permanent-resident')[0]
    expect(init.headers['Idempotency-Key']).toBeTruthy()
    expect(JSON.parse(init.body)).toEqual({ basisNote: 'Sổ hộ khẩu cùng phường' })
  })

  it('Q414_ghiDaTiepNhan_tamTru_batBuocAnhVaNgayHetHan', async () => {
    const api = mockRoutes()
    api.on('POST', '/files', json(201, { fileId: 900 }))
    api.on('POST', '/residence-registrations/7/record-accepted', json(200, {}))
    const onDone = renderForm('accepted', REGISTRATION, ['record-accepted'])
    expect(screen.queryByLabelText('Kênh nộp')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bị từ chối' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ảnh bằng chứng đã tiếp nhận')).toHaveAttribute('accept', 'image/jpeg,image/png')
    fireEvent.click(screen.getByRole('button', { name: 'Ghi đã tiếp nhận' }))
    expect(await screen.findByText('Chọn ảnh bằng chứng.')).toBeInTheDocument()
    expect(screen.getByText('Nhập ngày hết hạn.')).toBeInTheDocument()
    expect(api.fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Ảnh bằng chứng đã tiếp nhận'), { target: { files: [photo()] } })
    fireEvent.change(screen.getByLabelText('Ngày hết hạn'), { target: { value: '2027-09-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ghi đã tiếp nhận' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(bodyOf(api, 'record-accepted')).toEqual({ evidenceFileId: 900, expiryDate: '2027-09-30' })
  })

  it('Q414_thongBaoLuuTru_khongCoOHetHan', () => {
    mockRoutes()
    renderForm('accepted', NOTICE, ['record-accepted'])
    expect(screen.getByLabelText('Ảnh bằng chứng đã tiếp nhận')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ngày hết hạn')).not.toBeInTheDocument()
  })

  it('FR_008_ghiDaKhaiBaoXoa_batBuocBangChung_guiEvidenceFileId', async () => {
    const api = mockRoutes()
    api.on('POST', '/files', json(201, { fileId: 901 }))
    api.on('POST', '/residence-registrations/7/record-deregistered', json(200, {}))
    const onDone = renderForm('deregistered', { ...REGISTRATION, status: 'CONFIRMED' }, ['record-deregistered'])
    fireEvent.click(screen.getByRole('button', { name: 'Ghi đã khai báo xóa' }))
    expect(await screen.findByText('Chọn bằng chứng đã khai báo xóa.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Bằng chứng đã khai báo xóa'), { target: { files: [pdf()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Ghi đã khai báo xóa' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(bodyOf(api, 'record-deregistered')).toEqual({ evidenceFileId: 901 })
  })

  it('K4_409_hienAlertTrongKhung_khongDongForm', async () => {
    const api = mockRoutes()
    api.on(
      'POST',
      '/residence-registrations/7/record-deregistered',
      problem(409, 'RESIDENCY_NOT_ENDED', { detail: 'Người cao tuổi vẫn đang lưu trú' }),
    )
    api.on('POST', '/files', json(201, { fileId: 901 }))
    const onDone = renderForm('deregistered', { ...REGISTRATION, status: 'CONFIRMED' }, ['record-deregistered'])
    fireEvent.change(screen.getByLabelText('Bằng chứng đã khai báo xóa'), { target: { files: [pdf()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Ghi đã khai báo xóa' }))
    expect(await screen.findByText('Người cao tuổi vẫn đang lưu trú')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('K4_422_hienLoiGiaTriTrongKhung', async () => {
    const api = mockRoutes()
    api.on(
      'POST',
      '/residence-registrations/7/confirm-local-permanent-resident',
      problem(422, 'INVALID_VALUE', { detail: 'Căn cứ quá dài' }),
    )
    const onDone = renderForm('confirm-local')
    fireEvent.change(screen.getByLabelText('Căn cứ'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thường trú' }))
    expect(await screen.findByText('Căn cứ quá dài')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})
