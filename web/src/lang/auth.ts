import { LANGUAGE } from '@/enum/global'

export const LOGIN_SUCCESS_MESSAGE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Login successful!',
  [LANGUAGE.THAI]: 'เข้าสู่ระบบสำเร็จ!',
}

export const LOGIN_FAILURE_MESSAGE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Login failed!',
  [LANGUAGE.THAI]: 'เข้าสู่ระบบล้มเหลว!',
}

export const INVALID_CREDENTIALS_MESSAGE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Invalid username or password',
  [LANGUAGE.THAI]: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
}

export const TWO_FACTOR_NOT_SET_UP_MESSAGE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Two-factor authentication is not set up for this account',
  [LANGUAGE.THAI]: 'บัญชีนี้ยังไม่ได้ตั้งค่าการยืนยันตัวตนสองขั้นตอน',
}

export const TOO_MANY_ATTEMPTS_MESSAGE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Too many attempts. Please try again later.',
  [LANGUAGE.THAI]: 'ลองหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง',
}

export const OTP_DELIVERY_FAILURE_MESSAGE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Unable to send the verification code. Please try again.',
  [LANGUAGE.THAI]: 'ไม่สามารถส่งรหัสยืนยันได้ กรุณาลองใหม่',
}

export const OTP_SENT_MESSAGE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Verification code sent',
  [LANGUAGE.THAI]: 'ส่งรหัสยืนยันแล้ว',
}

export const LOGOUT_SUCCESS_MESSAGE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Logout successful!',
  [LANGUAGE.THAI]: 'ออกจากระบบสำเร็จ!',
}
