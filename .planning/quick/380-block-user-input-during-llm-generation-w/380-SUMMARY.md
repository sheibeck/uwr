# Quick Task 380: Block user input during LLM generation — Summary

## Changes

### Central action gate (App.vue)
- `onNarrativeSubmit`: Early return when `isNarrativeLlmProcessing` is true
- `clickNpcKeyword`: Early return when `isNarrativeLlmProcessing` is true
- All bracket link clicks and text submissions are blocked at these two entry points

### Input disabled state (NarrativeConsole.vue)
- Passes `isLlmProcessing` to NarrativeInput's `disabled` prop
- Input placeholder changes to "Awaiting response..." during LLM processing

### Input component fix (NarrativeInput.vue)
- Fixed disabled logic: was `disabled && !connActive` (both needed), now `disabled || !connActive` (either blocks)
- Send button also disabled when `disabled` is true

## Architecture
Two central gates (`onNarrativeSubmit` + `clickNpcKeyword`) block ALL user actions during LLM processing. No need to spread checks across individual handlers — every user action flows through one of these two functions.
