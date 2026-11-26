import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { CareRiskAgreementsForm } from './CareRiskAgreementsForm'

// Demo 2026-11-25: người tham gia, Bác sĩ, người thân đại diện, người thân nêu ý kiến chọn theo tên thay cho ô nhập mã
afterEach(() => vi.unstubAllGlobals())

const ROW = {
  choice: 'Tự đi lại',
  discussedRisks: 'Ngã',
  residentParticipates: true,
  participants: [{ type: 'STAFF', id: '' }],
  assessingDoctorId: '',
  selfDeterminationAssessment: { canSelfDetermine: 'true', supportMethod: 'Giải thích', reviewDate: '2027-01-01' },
  decisionMaker: { type: 'PATIENT_REPRESENTATIVE' },
  opinions: [{ source: { type: 'FAMILY_MEMBER' }, content: 'Đồng ý' }],
  reviewDate: '2027-01-01',
}

it('chonTheoTen_guiDungMa', async () => {
  const api = mockRoutes()
  api.on(
    'GET',
    '/staff',
    json(200, [
      { id: 5, fullName: 'Phạm Văn Bác', position: 'Bác sĩ' },
      { id: 6, fullName: 'Lê Thị Dưỡng', position: 'Điều dưỡng' },
    ]),
  )
  api.on(
    'GET',
    '/residents/77/family-contacts',
    json(200, [{ familyMemberId: 41, fullName: 'Trần Văn Minh' }]),
  )
  const onSave = vi.fn()
  render(<CareRiskAgreementsForm residentId={77} agreements={[ROW]} busy={false} onSave={onSave} />)
  const doctor = await screen.findByLabelText('Bác sĩ nhận định 1')
  expect(within(doctor).queryByRole('option', { name: /Lê Thị Dưỡng/ })).toBeNull()
  fireEvent.change(doctor, { target: { value: '5' } })
  fireEvent.change(screen.getByLabelText('Người tham gia 1.1'), { target: { value: '6' } })
  await within(screen.getByLabelText('Người thân đại diện 1')).findByRole('option', { name: 'Trần Văn Minh' })
  fireEvent.change(screen.getByLabelText('Người thân đại diện 1'), { target: { value: '41' } })
  fireEvent.change(screen.getByLabelText('Người thân nêu ý kiến 1.1'), { target: { value: '41' } })
  fireEvent.submit(screen.getByRole('heading', { name: 'Thỏa thuận lựa chọn có rủi ro' }).closest('form'))
  await waitFor(() => expect(onSave).toHaveBeenCalled())
  const [saved] = onSave.mock.calls[0][0]
  expect(saved.assessingDoctorId).toBe(5)
  expect(saved.participants).toEqual([{ type: 'STAFF', id: 6 }])
  expect(saved.decisionMaker.familyMemberId).toBe(41)
  expect(saved.opinions[0].source.familyMemberId).toBe(41)
})
