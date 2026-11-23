import { describe, expect, it } from 'vitest'
import { PortalBelongings } from '@/features/belongings/PortalBelongings'
import { FamilyPortal } from '@/features/family-portal/FamilyPortal'
import { rootPage } from './rootPage'

// BF-14 test web 2026-11-23: cổng người thân thật (/family) luôn ghi "Chưa có dữ liệu đồ gửi" vì main.jsx không truyền
// phần đồ gửi của 013 vào FamilyPortal (chỉ bản mẫu trong App.jsx có truyền)
describe('rootPage', () => {
  it('FR_030_congNguoiThan_coPhanDoGui', () => {
    const page = rootPage('/family')
    expect(page.type).toBe(FamilyPortal)
    expect(page.props.belongings).toBe(PortalBelongings)
  })
})
