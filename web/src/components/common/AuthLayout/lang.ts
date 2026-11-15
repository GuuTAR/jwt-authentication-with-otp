import { LANGUAGE } from '@/enum/global'

export const SHORT_SUMMARY: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Note your pending actions',
  [LANGUAGE.THAI]: 'จดบันทึกสิ่งที่ต้องทำของคุณ',
}

export const WELCOME_MESSAGE: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]: 'Welcome back to your todo list.',
  [LANGUAGE.THAI]: 'ยินดีต้อนรับกลับสู่รายการสิ่งที่ต้องทำของคุณ',
}

export const DESCRIPTION: Record<LANGUAGE, string> = {
  [LANGUAGE.ENGLISH]:
    'Note your pending actions, filter what is active or completed, and clear finished tasks when you are done.',
  [LANGUAGE.THAI]:
    'จดบันทึกสิ่งที่ต้องทำของคุณ กรองสิ่งที่ยังทำอยู่หรือเสร็จแล้ว และเคลียร์งานที่เสร็จสิ้นเมื่อคุณทำเสร็จแล้ว',
}
