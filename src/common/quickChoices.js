// Danh sách lựa chọn của ô chọn nhanh `ChoiceTray` ở các form BF-01 (chủ dự án chọn 2026-11-21: danh sách cố định trong
// web, kèm "Khác" để gõ tự do). Câu chữ là bản nháp, sửa ở đây là đổi ở mọi màn dùng. Giá trị vẫn lưu thành chữ.

export const APPLICATION_NEEDS = [
  'Hỗ trợ ăn uống',
  'Hỗ trợ vệ sinh cá nhân',
  'Hỗ trợ đi lại',
  'Theo dõi dùng thuốc',
  'Theo dõi bệnh mạn tính',
  'Chăm sóc sa sút trí tuệ',
  'Phục hồi chức năng',
  'Chăm sóc giảm nhẹ',
]

export const BED_ALLOCATION_REASONS = [
  'Phân bổ khi tiếp nhận',
  'Đặt trước giường cho ngày vào',
  'Theo yêu cầu của gia đình',
]

export const CONTRACT_REASONS = {
  'submit-terms-for-approval': ['Giảm giá theo thỏa thuận', 'Hoàn cảnh khó khăn'],
  'return-to-draft': [
    'Gia đình đổi dịch vụ',
    'Đổi mức chăm sóc theo đánh giá',
    'Đổi ngày bắt đầu',
    'Sai thông tin hợp đồng',
  ],
  cancel: ['Gia đình không tiếp tục', 'Lập lại hợp đồng mới'],
}

export const STATUS_COMMAND_REASONS = {
  COMPLETE_ADMISSION: ['Đủ điều kiện, người cao tuổi vào ở'],
  CANCEL_ADMISSION: ['Gia đình không tiếp tục', 'Chọn cơ sở khác', 'Không có giường phù hợp'],
}

export const ASSESSMENT_BASIS = ['Đánh giá đầu vào khi tiếp nhận']

export const ASSESSMENT_DISCARD_REASONS = ['Lập nhầm người', 'Thông tin chưa đủ, lập lại']

// Cách đã giúp người cao tuổi hiểu lựa chọn trước khi Bác sĩ nhận định tự quyết (Q-348, BR-M01-15; chủ dự án yêu cầu
// 2026-11-26 cho dễ hiểu): danh sách gợi ý, kèm "Khác", không chọn sẵn
export const SUPPORT_METHOD_CHOICES = [
  'Giải thích bằng lời, chậm, từng ý',
  'Có người thân cùng nghe',
  'Dùng tranh hoặc giấy viết',
  'Đeo máy trợ thính, kính',
  'Nói vào lúc tỉnh táo',
  'Hỏi lại sau một ngày',
  'Người cao tuổi nhắc lại được ý chính',
  'Đã giải thích nhưng không nhắc lại được',
]

export const CARE_NOTES = [
  'Nguy cơ ngã',
  'Ăn mềm, dễ nuốt',
  'Cần nhắc uống thuốc',
  'Nghe kém, nói to rõ',
  'Nhìn kém',
  'Hay quên, cần nhắc',
]

// Theo chủ đề của phần "Gia đình khai" (FAMILY_DECLARED_TOPIC_LABELS)
export const FAMILY_DECLARED_CHOICES = {
  GENERAL_CONDITION: ['Ăn uống kém', 'Ngủ kém', 'Sụt cân gần đây', 'Hay mệt'],
  MOBILITY: ['Đi lại tự lập', 'Đi cần gậy hoặc khung', 'Dùng xe lăn', 'Nằm tại giường', 'Từng ngã'],
  SELF_CARE: ['Tự ăn được', 'Cần hỗ trợ tắm rửa', 'Cần hỗ trợ vệ sinh', 'Cần hỗ trợ mặc quần áo'],
  COGNITION: ['Tỉnh táo', 'Hay quên', 'Lú lẫn về đêm', 'Đi lang thang'],
  KNOWN_RISKS: ['Nguy cơ ngã', 'Nghẹn, sặc khi ăn', 'Loét tì đè', 'Hay đi ra ngoài một mình'],
}

// Hồ sơ sức khỏe ban đầu (chủ dự án duyệt 2026-11-26): mỗi ô có khay chọn nhanh, chọn nhiều, kèm Khác. Ba ô khả năng dùng
// lại danh sách Gia đình khai; ghi chú nhu cầu dùng lại CARE_NOTES; các ô khác là bản nháp.
export const HEALTH_RECORD_CHOICES = {
  mobility: FAMILY_DECLARED_CHOICES.MOBILITY,
  selfCareAbility: FAMILY_DECLARED_CHOICES.SELF_CARE,
  cognition: FAMILY_DECLARED_CHOICES.COGNITION,
  initialNeedsNote: CARE_NOTES,
  nutritionNeeds: ['Ăn mềm, dễ nuốt', 'Ăn ít muối', 'Ăn ít đường', 'Ăn chay', 'Cần hỗ trợ khi ăn', 'Ăn qua ống thông'],
  currentMedications: [
    'Không dùng thuốc thường xuyên',
    'Thuốc huyết áp',
    'Thuốc tiểu đường',
    'Thuốc tim mạch',
    'Thuốc giảm đau khi cần',
  ],
  rehabilitationNeeds: ['Không cần', 'Tập đi lại', 'Phục hồi sau tai biến', 'Tập vận động tay', 'Tập nuốt'],
}

// Gợi ý nội dung mục bệnh nền, tiền sử bệnh (chọn một, hoặc Khác để gõ)
export const CHRONIC_CONDITION_CHOICES = [
  'Tăng huyết áp',
  'Đái tháo đường',
  'Bệnh tim',
  'Bệnh phổi tắc nghẽn mạn tính',
  'Thoái hóa khớp',
  'Sa sút trí tuệ',
]

export const MEDICAL_HISTORY_CHOICES = ['Tai biến mạch máu não', 'Nhồi máu cơ tim', 'Gãy xương', 'Phẫu thuật']
