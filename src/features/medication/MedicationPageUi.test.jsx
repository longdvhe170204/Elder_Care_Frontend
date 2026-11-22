import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { MedicationPage } from './MedicationPage'

// Trau chuốt giao diện màn Phát thuốc (2026-11-22): trạng thái liều dạng nhãn nền đậm, thẻ có bóng và hiệu ứng khi rê chuột,
// nút Phát thuốc nổi bật. Không đổi bố cục, chức năng, API.

let api

const DOSE = {
  doseKey: '7-202611080900',
  residentId: 9,
  prescriptionId: 7,
  medicationName: 'Metformin 500mg',
  dosage: 1,
  dosageUnit: 'viên',
  route: 'Uống',
  scheduledTime: '2026-11-08T02:00:00Z',
  windowFrom: '2026-11-08T01:30:00Z',
  windowTo: '2026-11-08T02:30:00Z',
  status: 'LATE',
  currentStatus: 'LATE',
  materialized: true,
  floorShared: false,
  requiresOnline: false,
  medicationSource: 'FACILITY',
  usableBatches: [],
}

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/medication-doses/rounds', json(200, [DOSE]))
  api.on('GET', '/residents/9', json(200, { id: 9, personalInfo: { fullName: 'Trần Thị Mai' }, activeHealthItems: [] }))
  api.on('GET', '/residents/9/location', json(200, { location: { room: 'P201', label: 'Khu A – Tầng 2 – P201 – G1' } }))
  api.on('GET', '/me/shifts', json(200, []))
})

afterEach(() => vi.unstubAllGlobals())

async function renderCard() {
  render(<MedicationPage role="NURSING_STAFF" />)
  await screen.findByText('Metformin 500mg')
  return document.querySelector('[data-slot="card"]')
}

describe('MedicationPage: trau chuốt giao diện', () => {
  it('trangThaiTre_laNhanNenDoDam_chuTrang', async () => {
    const card = await renderCard()
    const badge = within(card).getByText('Trễ')
    expect(badge.className).toMatch(/bg-destructive/)
    expect(badge.className).toMatch(/font-bold/)
  })

  it('the_coBongNheVaHieuUngReChuot', async () => {
    const card = await renderCard()
    expect(card.className).toMatch(/shadow-sm/)
    expect(card.className).toMatch(/hover:shadow-md/)
  })

  it('nutPhatThuoc_noiBat_vanLaNutChucNang', async () => {
    await renderCard()
    const button = screen.getByRole('button', { name: 'Phát thuốc' })
    expect(button.className).toMatch(/shadow/)
    expect(button.className).toMatch(/hover:-translate-y/)
  })

  it('theKhongCoVienDo', async () => {
    const card = await renderCard()
    expect(card.className).not.toMatch(/border-destructive|ring-destructive/)
  })
})
