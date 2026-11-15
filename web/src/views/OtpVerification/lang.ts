import { LANGUAGE } from '@/enum/global'

export const TITLE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Verify it’s you',
  [LANGUAGE.THAI]: 'ยืนยันตัวตนของคุณ',
}

export const HINT: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Enter the 6-digit code we sent to your phone. Check that the Ref matches.',
  [LANGUAGE.THAI]: 'กรอกรหัส 6 หลักที่ส่งไปยังโทรศัพท์ของคุณ และตรวจสอบว่า Ref ตรงกัน',
}
