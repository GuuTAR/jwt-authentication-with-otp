<script setup lang="ts">
import { DEFAULT_LANGUAGE } from '@/data/user'

import AuthLayout from '@/components/common/AuthLayout/AuthLayout.vue'
import AppName from '@/components/core/AppName/AppName.vue'
import FlexStack from '@/components/core/FlexStack/FlexStack.vue'
import TextVariant from '@/components/core/TextVariant/TextVariant.vue'

import OtpFormSection from '@/views/OtpVerification/section/OtpForm/OtpFormSection.vue'

import * as Languages from './lang'
</script>

<template>
  <main class="otp-verification-page">
    <AuthLayout>
      <FlexStack class="otp-verification-page__heading">
        <AppName :is-description-visible="false" />
        <TextVariant variant="h4" :bold="true">
          {{ Languages.TITLE[DEFAULT_LANGUAGE] }}
        </TextVariant>
        <TextVariant variant="body2" class="otp-verification-page__hint">
          {{ Languages.HINT[DEFAULT_LANGUAGE] }}
        </TextVariant>
      </FlexStack>

      <OtpFormSection />
    </AuthLayout>
  </main>
</template>

<style scoped>
.otp-verification-page__heading {
  flex-direction: column;
  gap: var(--app-spacing-4);
}

.otp-verification-page__hint {
  color: var(--p-primary-900);
}
</style>
