import { LANGUAGE } from '@/enum/global'

export const CODE_SENT_TO: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Code sent to',
  [LANGUAGE.THAI]: 'ส่งรหัสไปที่',
}

export const VERIFICATION_CODE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Verification code',
  [LANGUAGE.THAI]: 'รหัสยืนยัน',
}

export const VERIFY: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Verify',
  [LANGUAGE.THAI]: 'ยืนยัน',
}

export const EXPIRES_IN: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Code expires in',
  [LANGUAGE.THAI]: 'รหัสจะหมดอายุใน',
}

export const EXPIRED: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'This code has expired. Please sign in again.',
  [LANGUAGE.THAI]: 'รหัสนี้หมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง',
}

export const RESEND: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Resend code',
  [LANGUAGE.THAI]: 'ส่งรหัสอีกครั้ง',
}

export const RESEND_IN: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Resend code in',
  [LANGUAGE.THAI]: 'ส่งรหัสอีกครั้งได้ใน',
}

export const SIGN_IN_AGAIN: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Sign in again',
  [LANGUAGE.THAI]: 'เข้าสู่ระบบอีกครั้ง',
}

export const USE_ANOTHER_ACCOUNT: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Use a different account',
  [LANGUAGE.THAI]: 'ใช้บัญชีอื่น',
}
