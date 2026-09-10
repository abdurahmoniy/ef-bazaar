# Listing platform attributes

Mobile uses Google Play/Game Center links, Android/iOS coin balances and device transfer limit. Steam/PlayStation use one optional integer `coins` balance; negative values remain supported. Every other attribute stays shared.

Implementation:
- [x] Add shared frontend applicability helpers, preserving older Mobile listings without a platform.
- [x] Put platform selection first, filter create/edit fields and validation, discard hidden fields on platform changes and submission, and update preview.
- [x] Hide mobile-only fields/warnings on console cards and detail pages, including stale saved values; display general console coins without inferring them from Mobile balances.
- [x] Apply equivalent backend validation/normalization and register coins in the repeatable attribute-definition migration. Preserve partial updates that do not submit attributes.
- [x] Add creation, editing, platform-switch, display and backend persistence regression tests.

The frontend and marketplace-service changes should be released together so the API recognizes the new coins key. Existing versioned migrations are unchanged.
