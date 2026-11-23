// Chỉ số đo trước khi dùng thuốc (BR-M07-26): mã theo danh mục chỉ số (M06.VITAL_SIGN). Hợp đồng chỉ có một giá trị cho
// mỗi mã nên huyết áp nhập huyết áp tâm thu.
export const MEASUREMENTS = [
  { code: 'BLOOD_PRESSURE', label: 'Huyết áp tâm thu', unit: 'mmHg' },
  { code: 'HEART_RATE', label: 'Mạch', unit: 'nhịp/phút' },
  { code: 'BLOOD_GLUCOSE', label: 'Đường huyết', unit: 'mmol/L' },
]

export const measurementLabel = (code) => MEASUREMENTS.find((m) => m.code === code)?.label ?? code
export const measurementUnit = (code) => MEASUREMENTS.find((m) => m.code === code)?.unit ?? ''
export const isNumber = (value) => value !== undefined && value !== '' && Number.isFinite(Number(String(value).replace(',', '.')))
