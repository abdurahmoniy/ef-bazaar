# Platform trade routing

Goal: restrict Smart Admin to mobile and hand Steam / PlayStation negotiations to existing support admins after the parties agree in chat.

Design: use listing attributes from the selected account request, never a different original chat listing. Unknown platform data cannot start automation. Keep the disabled HUMAN feature disabled; its documented referral issue is outside this change. The handoff opens an editable support draft; opening it does not send a message or freeze funds. Existing active trades keep their lifecycle controls.

- [x] Add and test platform resolution, mobile eligibility and context-preserving support links.
- [x] Route new non-mobile proposals and old pending non-mobile proposals to an admin handoff card, retaining account selection and mobile behavior.
- [x] Prefill both new and existing support conversations, without automatic submission.
- [x] Run behavioral regression tests, TypeScript and lint checks; review the diff.

Scope: frontend routing. Direct calls to the separately deployed trade-service remain a backend enforcement concern.

Validation: all 132 frontend test files / 1,016 tests passed. TypeScript passed. Targeted lint has no errors; trade-panel retains its existing raw image warning. Independent review findings (proposal CTA and duplicate support draft after creation) were reproduced with failing behavioral tests and fixed. Listing detail guidance now distinguishes Mobile escrow from non-mobile admin assistance.
