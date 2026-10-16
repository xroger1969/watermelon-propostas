# Watermelon Experiences — TestFlight QA notes

## 2026-10-16 — Auto-growing Watermelon AI chat composer

- The main Watermelon AI text field now expands as a message is typed, from one up to seven visible lines.
- The Explore and Proposals quick-AI field expands from one up to five visible lines.
- Long drafts can still be scrolled inside the field; the microphone and Send controls remain visible.
- After sending, the field returns to its compact empty state.
- Regression coverage: `testAIComposerExpandsForLongDraftsAndKeepsSendAccessible`.

### Manual checks on TestFlight (iPhone)
1. Open Watermelon AI. Type a multi-paragraph message without sending and confirm the input box grows.
2. Check Send remains accessible with the iPhone keyboard open.
3. Send the message and confirm the box contracts again, without losing the conversation.
4. Repeat with quick-AI input on Explore and Proposals.

Source: PR #51. No change to CRM, payment handling, or WhatsApp.
