import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { FamilyMemberSelect } from './FamilyMemberSelect'
import { useFamilyMembers } from './useFamilyMembers'

// Ô chọn người thân: phân biệt "chưa có người thân" với "không đọc được danh sách" (thiếu quyền), BF-01 bước 3a.

let api

function Harness() {
  const members = useFamilyMembers(9)
  return <FamilyMemberSelect id="m" label="Người thân" members={members} value="" onChange={() => {}} />
}

beforeEach(() => {
  api = mockRoutes()
})

afterEach(() => vi.unstubAllGlobals())

describe('FamilyMemberSelect', () => {
  it('BF_01_buoc3a_khongCoQuyenDoc_baoKhongDocDuocThayVìChuaCo', async () => {
    api.on('GET', '/residents/9/family-contacts', problem(403, 'PERMISSION_DENIED'))
    render(<Harness />)
    expect(await screen.findByRole('option', { name: 'Không đọc được danh sách người thân' })).toBeTruthy()
  })

  it('BF_01_buoc3a_danhSachRong_baoChuaCoNguoiThan', async () => {
    api.on('GET', '/residents/9/family-contacts', json(200, []))
    render(<Harness />)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByRole('option', { name: 'Chưa có người thân có quan hệ Hiệu lực' })).toBeTruthy()
  })
})
