import { handleAiRequest } from '../ai/worker-protocol.js'

globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
  const start = performance.now()
  const receivedAt = performance.timeOrigin + start
  const response = handleAiRequest(event.data, { now: () => performance.now() })
  globalThis.postMessage({ ...response, timing: { receivedAt, handlingMs: performance.now() - start } })
})
