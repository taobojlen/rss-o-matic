<script setup lang="ts">
import type { LogEntry } from "~/composables/useGenerateStream";

const props = defineProps<{
  isStreaming: boolean;
  logEntries: LogEntry[];
}>();

const logBody = ref<HTMLElement | null>(null);

// Auto-scroll to bottom when new entries appear or streaming text grows
watch(
  () => {
    const entries = props.logEntries;
    const last = entries[entries.length - 1];
    // Track both array length and last entry's message length to catch token appends
    return `${entries.length}:${last?.message?.length ?? 0}`;
  },
  () => {
    nextTick(() => {
      if (logBody.value) {
        logBody.value.scrollTop = logBody.value.scrollHeight;
      }
    });
  }
);
</script>

<template>
  <div class="agent-log">
    <div class="agent-log-header">
      <span class="agent-log-indicator" :class="{ active: isStreaming }" />
      <span class="agent-log-title">Robot Log</span>
    </div>
    <div ref="logBody" class="agent-log-body">
      <template v-for="(entry, i) in logEntries" :key="i">
        <div v-if="entry.type === 'ai_text'" class="agent-log-ai-text" :class="{ streaming: entry.streaming }">
          <span class="log-message">{{ entry.message }}</span>
          <span v-if="entry.streaming" class="agent-log-cursor inline" />
        </div>
        <div v-else class="agent-log-entry" :class="entry.type">
          <span class="log-chevron">&gt;</span>
          <span class="log-message">{{ entry.message }}</span>
        </div>
      </template>
      <span v-if="isStreaming && !logEntries.some(e => e.streaming)" class="agent-log-cursor" />
    </div>
  </div>
</template>

<style scoped>
.agent-log {
  background: #1a2a28;
  border: 3px solid;
  border-color: #3a5a54 #2a4a44 #2a4a44 #3a5a54;
  border-radius: 4px;
  margin-bottom: 1.5rem;
  box-shadow:
    inset 0 0 30px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.agent-log-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(180deg, #2a4a44 0%, #1a3a34 100%);
  border-bottom: 2px solid #0e2e28;
}

.agent-log-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a6a64;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
}

.agent-log-indicator.active {
  background: #40e070;
  box-shadow:
    0 0 6px rgba(64, 224, 112, 0.5),
    inset 0 1px 2px rgba(255, 255, 255, 0.2);
  animation: indicator-pulse 1.5s ease-in-out infinite;
}

@keyframes indicator-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.agent-log-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: #6a9a8e;
  font-weight: 600;
}

.agent-log-body {
  padding: 0.75rem 1rem;
  max-height: 240px;
  overflow-y: auto;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.82rem;
  line-height: 1.7;
  text-align: left;
}

.agent-log-entry {
  color: #40c070;
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}

.agent-log-entry.tool_call {
  color: #60d0d0;
}

.agent-log-entry.tool_result {
  color: #a0d060;
}

.agent-log-entry.error {
  color: #e06040;
}

.log-chevron {
  color: #4a7a6e;
  flex-shrink: 0;
  user-select: none;
}

.log-message {
  word-break: break-word;
}

/* Streaming AI text block */
.agent-log-ai-text {
  color: #5a9a7a;
  padding: 0.25rem 0;
  white-space: pre-wrap;
  word-break: break-word;
  border-left: 2px solid #2a4a44;
  padding-left: 0.75rem;
  margin: 0.25rem 0;
  font-size: 0.78rem;
  line-height: 1.5;
  opacity: 0.85;
}

.agent-log-ai-text.streaming {
  opacity: 1;
}

/* Blinking cursor at the end of the log */
.agent-log-cursor {
  display: inline-block;
  width: 8px;
  height: 1em;
  background: #40c070;
  animation: cursor-blink 0.8s step-end infinite;
  margin-top: 0.25rem;
}

.agent-log-cursor.inline {
  margin-top: 0;
  margin-left: 2px;
  vertical-align: text-bottom;
}

@keyframes cursor-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

</style>
