<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { storeToRefs } from 'pinia'

import Button from 'primevue/button'
import InputOtp from 'primevue/inputotp'

import { useAppDataStore } from '@/stores/appData'
import { useAuthStore } from '@/stores/auth'

import { useAuth } from '@/composables/useAuth'
import { useCountdown } from '@/composables/useCountdown'

import FlexStack from '@/components/core/FlexStack/FlexStack.vue'

import * as Languages from './lang'

const { language } = storeToRefs(useAppDataStore())
const { pendingLogin } = storeToRefs(useAuthStore())
const { isLoading, verifyOtp, resendOtp, cancelLogin } = useAuth()
const expiry = useCountdown(() => pendingLogin.value?.expiresAt)
const resendCooldown = useCountdown(() => pendingLogin.value?.resendAvailableAt)

const code = ref('')

const isExpired = computed(() => expiry.remainingSeconds.value === 0)
const canVerify = computed(
  () => code.value.length === OTP_LENGTH && !isLoading.value && !isExpired.value,
)
const canResend = computed(
  () => resendCooldown.remainingSeconds.value === 0 && !isLoading.value && !isExpired.value,
)

// Submit as soon as the last digit is entered or a code is pasted.
watch(code, () => {
  if (canVerify.value) void handleVerify()
})

async function handleVerify(): Promise<void> {
  if (!canVerify.value) return
  const isVerified = await verifyOtp(code.value)
  if (!isVerified) code.value = ''
}

async function handleResend(): Promise<void> {
  if (!canResend.value) return
  code.value = ''
  await resendOtp()
}

const OTP_LENGTH = 6
const OTP_INPUT_PT = {
  pcInputText: {
    root: {
      inputmode: 'numeric',
      autocomplete: 'one-time-code',
      'aria-labelledby': 'otp-code-label',
    },
  },
}
</script>

<template>
  <FlexStack class="otp-verification-page__form-section">
    <p class="otp-verification-page__form-section-sent-to">
      {{ Languages.CODE_SENT_TO[language] }}
      <strong>{{ pendingLogin?.phone_hint }}</strong>
      <span class="otp-verification-page__form-section-ref">Ref: {{ pendingLogin?.ref }}</span>
    </p>

    <form
      novalidate
      @submit.prevent="handleVerify"
      class="otp-verification-page__form-section-form"
    >
      <span id="otp-code-label" class="otp-verification-page__form-section-label">
        {{ Languages.VERIFICATION_CODE[language] }}
      </span>
      <InputOtp
        v-model="code"
        :length="OTP_LENGTH"
        :disabled="isLoading || isExpired"
        :pt="OTP_INPUT_PT"
        integer-only
        role="group"
        aria-labelledby="otp-code-label"
        class="otp-verification-page__form-section-input"
      />
      <Button
        :label="Languages.VERIFY[language]"
        :disabled="!canVerify"
        :loading="isLoading"
        type="submit"
        icon="pi pi-check"
        fluid
        class="otp-verification-page__form-section-submit"
      />
    </form>

    <p v-if="isExpired" role="alert" class="otp-verification-page__form-section-expired">
      {{ Languages.EXPIRED[language] }}
    </p>
    <p v-else class="otp-verification-page__form-section-timer">
      {{ Languages.EXPIRES_IN[language] }} {{ expiry.formatted.value }}
    </p>

    <Button
      v-if="isExpired"
      :label="Languages.SIGN_IN_AGAIN[language]"
      icon="pi pi-sign-in"
      fluid
      @click="cancelLogin"
    />
    <FlexStack v-else class="otp-verification-page__form-section-actions">
      <Button
        :label="
          canResend
            ? Languages.RESEND[language]
            : `${Languages.RESEND_IN[language]} ${resendCooldown.formatted.value}`
        "
        :disabled="!canResend"
        icon="pi pi-refresh"
        variant="text"
        @click="handleResend"
      />
      <Button
        :label="Languages.USE_ANOTHER_ACCOUNT[language]"
        :disabled="isLoading"
        variant="text"
        severity="secondary"
        @click="cancelLogin"
      />
    </FlexStack>
  </FlexStack>
</template>

<style scoped>
.otp-verification-page__form-section {
  flex-direction: column;
  gap: var(--app-spacing-4);
  width: 100%;
}

.otp-verification-page__form-section-sent-to {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-spacing-2);
  margin: 0;
  font-size: 14px;
  color: var(--p-primary-900);
}

.otp-verification-page__form-section-ref {
  padding: var(--app-spacing-1) var(--app-spacing-2);
  border-radius: 6px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--p-primary-700);
  background: var(--p-primary-100);
}

.otp-verification-page__form-section-form {
  display: flex;
  flex-direction: column;
  gap: var(--app-spacing-3);
}

.otp-verification-page__form-section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--p-primary-900);
}

.otp-verification-page__form-section-input {
  justify-content: space-between;
}

.otp-verification-page__form-section-input :deep(.p-inputotp-input) {
  width: 40px;
  font-size: 20px;
  text-align: center;
}

.otp-verification-page__form-section-timer,
.otp-verification-page__form-section-expired {
  margin: 0;
  font-size: 14px;
  color: var(--p-primary-900);
}

.otp-verification-page__form-section-expired {
  font-weight: 600;
}

.otp-verification-page__form-section-actions {
  flex-direction: column;
  align-items: flex-start;
}
</style>
