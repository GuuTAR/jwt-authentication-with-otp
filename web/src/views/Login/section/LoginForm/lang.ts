import { LANGUAGE } from '@/enum/global'

export const USERNAME: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Username',
  [LANGUAGE.THAI]: 'ชื่อผู้ใช้',
}

export const USERNAME_PLACEHOLDER: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Enter your username',
  [LANGUAGE.THAI]: 'กรอกชื่อผู้ใช้',
}

export const PASSWORD: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Password',
  [LANGUAGE.THAI]: 'รหัสผ่าน',
}

export const PASSWORD_PLACEHOLDER: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Enter your password',
  [LANGUAGE.THAI]: 'กรอกรหัสผ่าน',
}

export const SIGN_IN: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Sign in',
  [LANGUAGE.THAI]: 'เข้าสู่ระบบ',
}
