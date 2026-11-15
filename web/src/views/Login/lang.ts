import { LANGUAGE } from '@/enum/global'

export const SIGN_IN: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Sign in',
  [LANGUAGE.THAI]: 'เข้าสู่ระบบ',
}

export const SIGN_IN_HINT: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]:
    'Use your username and password. We will send a verification code to your phone.',
  [LANGUAGE.THAI]: 'ใช้ชื่อผู้ใช้และรหัสผ่านของคุณ ระบบจะส่งรหัสยืนยันไปยังโทรศัพท์ของคุณ',
}
