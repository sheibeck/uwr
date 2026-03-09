# Quick Task 380: Block user input during LLM generation

## Task 1: Central action gate for LLM processing

### Files
- `src/App.vue` — add early return in `onNarrativeSubmit` and `clickNpcKeyword`
- `src/components/NarrativeConsole.vue` — pass `isLlmProcessing` to disable input
- `src/components/NarrativeInput.vue` — fix disabled logic, dim input during LLM

### Changes
1. Gate `onNarrativeSubmit` with `isNarrativeLlmProcessing` check (early return)
2. Gate `clickNpcKeyword` with `isNarrativeLlmProcessing` check (early return)
3. Pass `isLlmProcessing` as part of NarrativeInput's `disabled` prop
4. Fix NarrativeInput disabled logic: `disabled || !connActive` (was `disabled && !connActive`)
5. Show "Awaiting response..." placeholder when LLM is processing
6. Disable send button when `disabled` is true
