import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { EndOfLifeWish } from './EndOfLifeWish'
import { TreatmentWish } from './TreatmentWish'

// 001 T116 (Q-412, BR-M01-18; FR-023n → FR-023q; US7 #12, #13): Hành chính lập bản Nháp tự khai khi người cao tuổi còn
// Đang tiếp nhận, nhãn "Tự khai, chưa được Bác sĩ kiểm chứng"; Bác sĩ, Điều dưỡng thấy Nháp, Kiểm chứng bằng biểu mẫu
// đầy đủ điền sẵn từ Nháp, Hủy nháp có lý do; còn Nháp thì không có nút ghi phiếu mới.

let api

beforeEach(() => {
  api = mockRoutes()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const DRAFT = {
  id: 40,
  choice: 'STAY_PALLIATIVE',
  firstContact: 'Con trai 0901',
  note: 'Gia đình muốn ở lại viện',
  selfDeterminationAssessment: null,
  signer: null,
  signerType: null,
  representativeSelection: null,
  otherOpinions: [],
  signedAt: null,
  source: null,
  status: 'DRAFT',
  recordedBy: 'Hành chính Hoa',
  verifiedBy: null,
  verifiedAt: null,
  discard: null,
}

const TREATMENT_DRAFT = {
  id: 41,
  preferredHospitals: [{ name: 'Bệnh viện X', address: '12 Lê Lợi' }],
  healthInsurance: null,
  askFamilyFirst: null,
  notifyFamilyMembers: [],
  accompaniedBy: null,
  note: null,
  respondent: { type: 'RESIDENT', familyMemberId: null },
  otherOpinions: [],
  signedCopyFileId: null,
  recordedBy: 'Hành chính Hoa',
  at: '2026-11-17T02:00:00Z',
  status: 'DRAFT',
}

describe('Nháp phiếu nguyện vọng cuối đời', () => {
  it('Hành chính chưa có Nháp: lập bản Nháp không có nhận định, gửi PUT rồi hiện nhãn tự khai', async () => {
    api.on('GET', '/residents/5/end-of-life-wishes', problem(403, 'PERMISSION_DENIED'))
    api.on('GET', '/residents/5/end-of-life-wish-draft', problem(404, 'NO_DRAFT'))
    api.on('PUT', '/residents/5/end-of-life-wish-draft', () => {
      api.on('GET', '/residents/5/end-of-life-wish-draft', json(200, DRAFT))
      return json(201, DRAFT)
    })
    render(
      <EndOfLifeWish
        residentId={5}
        status="ADMISSION_IN_PROGRESS"
        allowedCommands={['DRAFT_END_OF_LIFE_WISH']}
        hasWish={false}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Lập bản Nháp tự khai' }))
    const form = screen.getByRole('form', { name: 'Bản Nháp phiếu nguyện vọng cuối đời' })
    expect(within(form).queryByLabelText('Mã tài khoản Bác sĩ nhận định')).toBeNull()
    fireEvent.click(within(form).getByRole('radio', { name: 'Ở lại viện chăm sóc giảm nhẹ' }))
    fireEvent.change(within(form).getByLabelText('Người cần liên hệ trước khi thực hiện'), {
      target: { value: 'Con trai 0901' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu bản Nháp' }))

    await waitFor(() => expect(api.calls('PUT', '/residents/5/end-of-life-wish-draft')).toHaveLength(1))
    const body = JSON.parse(api.calls('PUT', '/residents/5/end-of-life-wish-draft')[0][1].body)
    expect(body).toMatchObject({ choice: 'STAY_PALLIATIVE', firstContact: 'Con trai 0901', respondentType: 'RESIDENT' })
    expect(body.selfDeterminationAssessment).toBeUndefined()
    expect(await screen.findByText('Tự khai, chưa được Bác sĩ kiểm chứng')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sửa bản Nháp' })).toBeInTheDocument()
  })

  it('Bác sĩ thấy Nháp chờ kiểm chứng: không có nút ghi phiếu mới; Kiểm chứng gửi đủ nội dung, không có nguồn', async () => {
    api.on(
      'GET',
      '/residents/5/end-of-life-wishes',
      json(200, { hasEndOfLifeWish: false, current: null, history: [], hiddenFields: [] }),
    )
    api.on('GET', '/residents/5/end-of-life-wish-draft', json(200, DRAFT))
    api.on('POST', '/files', json(201, { fileId: 77 }))
    api.on('POST', '/residents/5/end-of-life-wish-draft/verify', json(200, { ...DRAFT, status: 'ACTIVE' }))
    render(
      <EndOfLifeWish residentId={5} status="ADMISSION_IN_PROGRESS" allowedCommands={['RECORD_END_OF_LIFE_WISH']} />,
    )

    const card = await screen.findByRole('region', { name: 'Bản Nháp tự khai chờ kiểm chứng' })
    expect(within(card).getByText('Tự khai, chưa được Bác sĩ kiểm chứng')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ghi phiếu nguyện vọng' })).toBeNull()

    fireEvent.click(within(card).getByRole('button', { name: 'Kiểm chứng' }))
    const form = screen.getByRole('form', { name: 'Kiểm chứng phiếu nguyện vọng cuối đời' })
    expect(within(form).getByLabelText('Người cần liên hệ trước khi thực hiện')).toHaveValue('Con trai 0901')
    fireEvent.change(within(form).getByLabelText('Mã tài khoản Bác sĩ nhận định'), { target: { value: '8' } })
    fireEvent.click(
      within(within(form).getByRole('radiogroup', { name: /tự quyết được/ })).getByRole('radio', { name: 'Có' }),
    )
    fireEvent.change(within(form).getByLabelText('Cách đã hỗ trợ người cao tuổi hiểu thông tin'), {
      target: { value: 'Giải thích bằng lời' },
    })
    fireEvent.change(within(form).getByLabelText('Ngày xem lại nhận định'), { target: { value: '2099-01-01' } })
    fireEvent.change(within(form).getByLabelText('Bản ký đã scan'), {
      target: { files: [new File(['%PDF-1.4'], 'ky.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Kiểm chứng và lưu' }))

    await waitFor(() => expect(api.calls('POST', '/residents/5/end-of-life-wish-draft/verify')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/residents/5/end-of-life-wish-draft/verify')[0][1].body)
    expect(body).toMatchObject({ choice: 'STAY_PALLIATIVE', assessingDoctorId: 8, signedCopyFileId: 77 })
    expect(body.source).toBeUndefined()
  })

  it('Hủy nháp bắt buộc lý do rồi gửi lý do', async () => {
    api.on(
      'GET',
      '/residents/5/end-of-life-wishes',
      json(200, { hasEndOfLifeWish: false, current: null, history: [], hiddenFields: [] }),
    )
    api.on('GET', '/residents/5/end-of-life-wish-draft', json(200, DRAFT))
    api.on('POST', '/residents/5/end-of-life-wish-draft/discard', json(200, { ...DRAFT, status: 'DISCARDED' }))
    render(
      <EndOfLifeWish residentId={5} status="ADMISSION_IN_PROGRESS" allowedCommands={['RECORD_END_OF_LIFE_WISH']} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Hủy nháp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy nháp' }))
    expect(await screen.findByText('Nhập lý do hủy nháp')).toBeInTheDocument()
    expect(api.calls('POST', '/residents/5/end-of-life-wish-draft/discard')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Lý do hủy nháp'), { target: { value: 'Gia đình khai nhầm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy nháp' }))
    await waitFor(() => expect(api.calls('POST', '/residents/5/end-of-life-wish-draft/discard')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residents/5/end-of-life-wish-draft/discard')[0][1].body)).toEqual({
      reason: 'Gia đình khai nhầm',
    })
  })
})

describe('Nháp phiếu nguyện vọng khi điều trị', () => {
  it('Hành chính lập Nháp chỉ với người trả lời và một bệnh viện, không bắt buộc người đi kèm', async () => {
    api.on('GET', '/residents/5/treatment-wishes', problem(403, 'PERMISSION_DENIED'))
    api.on('GET', '/residents/5/treatment-wish-draft', problem(404, 'NO_DRAFT'))
    api.on('PUT', '/residents/5/treatment-wish-draft', json(201, TREATMENT_DRAFT))
    render(
      <TreatmentWish
        residentId={5}
        status="ADMISSION_IN_PROGRESS"
        allowedCommands={['DRAFT_TREATMENT_WISH']}
        hasWish={false}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Lập bản Nháp tự khai' }))
    const form = screen.getByRole('form', { name: 'Bản Nháp phiếu nguyện vọng khi điều trị' })
    fireEvent.change(within(form).getByLabelText('Tên bệnh viện 1'), { target: { value: 'Bệnh viện X' } })
    fireEvent.change(within(form).getByLabelText('Địa chỉ bệnh viện 1'), { target: { value: '12 Lê Lợi' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu bản Nháp' }))

    await waitFor(() => expect(api.calls('PUT', '/residents/5/treatment-wish-draft')).toHaveLength(1))
    const body = JSON.parse(api.calls('PUT', '/residents/5/treatment-wish-draft')[0][1].body)
    expect(body).toMatchObject({
      preferredHospitals: [{ name: 'Bệnh viện X', address: '12 Lê Lợi' }],
      respondent: { type: 'RESIDENT' },
    })
    expect(body.accompaniedBy).toBeUndefined()
    expect(await screen.findByText('Tự khai, chưa được Bác sĩ kiểm chứng')).toBeInTheDocument()
  })

  it('Điều dưỡng kiểm chứng Nháp bằng biểu mẫu điền sẵn, gửi tới đường dẫn kiểm chứng', async () => {
    api.on('GET', '/residents/5/treatment-wishes', json(200, { active: null, history: [], hiddenFields: [] }))
    api.on('GET', '/residents/5/treatment-wish-draft', json(200, TREATMENT_DRAFT))
    api.on(
      'POST',
      '/residents/5/treatment-wish-draft/verify',
      json(200, { wish: { ...TREATMENT_DRAFT, status: 'ACTIVE' }, warnings: [] }),
    )
    render(<TreatmentWish residentId={5} status="IN_RESIDENCE" allowedCommands={['RECORD_TREATMENT_WISH']} />)

    const card = await screen.findByRole('region', { name: 'Bản Nháp tự khai chờ kiểm chứng' })
    expect(screen.queryByRole('button', { name: 'Ghi phiếu nguyện vọng' })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Kiểm chứng' }))
    const form = screen.getByRole('form', { name: 'Kiểm chứng phiếu nguyện vọng khi điều trị' })
    expect(within(form).getByLabelText('Tên bệnh viện 1')).toHaveValue('Bệnh viện X')
    fireEvent.click(within(form).getByRole('radio', { name: 'Gia đình' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Kiểm chứng và lưu' }))

    await waitFor(() => expect(api.calls('POST', '/residents/5/treatment-wish-draft/verify')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residents/5/treatment-wish-draft/verify')[0][1].body)).toMatchObject({
      preferredHospitals: [{ name: 'Bệnh viện X', address: '12 Lê Lợi' }],
      accompaniedBy: 'FAMILY',
    })
  })
})
