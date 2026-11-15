<script setup lang="ts">
import { computed, ref } from 'vue'

import { storeToRefs } from 'pinia'

import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'

import { useAppDataStore } from '@/stores/appData'

import { useAuth } from '@/composables/useAuth'

import FlexStack from '@/components/core/FlexStack/FlexStack.vue'

import * as Languages from './lang'

const { language } = storeToRefs(useAppDataStore())
const { isLoading, login } = useAuth()

const username = ref('')
const password = ref('')

const canSubmit = computed(
  () => username.value.trim().length > 0 && password.value.length > 0 && !isLoading.value,
)

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) return
  const isOtpSent = await login({ username: username.value.trim(), password: password.value })
  // The password is no longer needed once the OTP step has started.
  if (isOtpSent) password.value = ''
}
</script>

<template>
  <FlexStack class="login-page__form-section">
    <form novalidate @submit.prevent="handleSubmit" class="login-page__form-section-form">
      <div class="login-page__form-section-field">
        <label for="login-username" class="login-page__form-section-label">
          {{ Languages.USERNAME[language] }}
        </label>
        <InputText
          id="login-username"
          v-model="username"
          :placeholder="Languages.USERNAME_PLACEHOLDER[language]"
          :disabled="isLoading"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          fluid
          class="login-page__form-section-input"
        />
      </div>

      <div class="login-page__form-section-field">
        <label for="login-password" class="login-page__form-section-label">
          {{ Languages.PASSWORD[language] }}
        </label>
        <Password
          v-model="password"
          :placeholder="Languages.PASSWORD_PLACEHOLDER[language]"
          :disabled="isLoading"
          :feedback="false"
          :input-props="{ autocomplete: 'current-password', name: 'password' }"
          input-id="login-password"
          toggle-mask
          fluid
          class="login-page__form-section-input"
        />
      </div>

      <Button
        :label="Languages.SIGN_IN[language]"
        :disabled="!canSubmit"
        :loading="isLoading"
        type="submit"
        icon="pi pi-sign-in"
        fluid
        class="login-page__form-section-submit"
      />
    </form>
  </FlexStack>
</template>

<style scoped>
.login-page__form-section {
  flex-direction: column;
  width: 100%;
}

.login-page__form-section-form {
  display: flex;
  flex-direction: column;
  gap: var(--app-spacing-4);
  width: 100%;
}

.login-page__form-section-field {
  display: flex;
  flex-direction: column;
  gap: var(--app-spacing-2);
}

.login-page__form-section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--p-primary-900);
}

.login-page__form-section-submit {
  margin-top: var(--app-spacing-2);
}
</style>
