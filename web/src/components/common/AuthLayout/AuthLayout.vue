<script setup lang="ts">
import { DEFAULT_LANGUAGE } from '@/data/user'

import { useBreakpoint } from '@/composables/useBreakpoint'

import FlexStack from '@/components/core/FlexStack/FlexStack.vue'
import TextVariant from '@/components/core/TextVariant/TextVariant.vue'

import * as Languages from './lang'

const { isDesktop } = useBreakpoint()
</script>

<template>
  <FlexStack class="auth-layout">
    <FlexStack v-if="isDesktop" class="auth-layout__hero">
      <TextVariant variant="body1" class="auth-layout__overline">
        {{ Languages.SHORT_SUMMARY[DEFAULT_LANGUAGE] }}
      </TextVariant>
      <TextVariant variant="h1">
        {{ Languages.WELCOME_MESSAGE[DEFAULT_LANGUAGE] }}
      </TextVariant>
      <TextVariant variant="body1">
        {{ Languages.DESCRIPTION[DEFAULT_LANGUAGE] }}
      </TextVariant>
    </FlexStack>

    <FlexStack class="auth-layout__panel">
      <FlexStack class="auth-layout__content">
        <slot />
      </FlexStack>
    </FlexStack>
  </FlexStack>
</template>

<style scoped>
.auth-layout {
  min-height: 100vh;
}

.auth-layout__hero {
  flex: 2;
  flex-direction: column;
  justify-content: center;
  gap: var(--app-spacing-4);
  padding: var(--app-spacing-0) var(--app-spacing-16);
  background: linear-gradient(
    155deg,
    var(--p-primary-500) 0%,
    var(--p-primary-600) 55%,
    var(--p-primary-700) 100%
  );
  color: var(--p-primary-0);
}

.auth-layout__overline {
  text-transform: uppercase;
  letter-spacing: 2px;
}

.auth-layout__panel {
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: var(--app-spacing-6) var(--app-spacing-4);
  background: var(--p-primary-0);
}

.auth-layout__content {
  flex-direction: column;
  width: 300px;
  max-width: 100%;
  gap: var(--app-spacing-4);
}
</style>
