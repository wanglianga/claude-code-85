<template>
  <div class="toast-wrap">
    <div v-for="t in toast.items" :key="t.id" class="toast" :class="t.kind">{{ t.text }}</div>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/useToast'
const toast = useToast()
</script>
