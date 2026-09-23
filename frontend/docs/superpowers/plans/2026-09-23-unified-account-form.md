# Unified account form

User approved one form in both /profile/accounts/new and /marketplace/new, with final actions Saqlash and Sotuvga qo'yish.

- [x] Both new-account entries render AccountForm with identical name, photos, description, players, and gameplay steps. Existing-account selection in Sotish remains available.
- [x] Saqlash persists the private account and returns to Akkountlarim. Sotuvga qo'yish validates publishing requirements, saves the same account, then shows price/terms using PublishAccountDialog. No listing is published until its explicit submit.
- [x] Keep the editor mounted when returning from pricing. Track the successfully saved account ID so upload failures or revisiting price do not create another account. Published account editing retains save-only semantics.
- [x] Match the publishing action label in the shared price form. Avoid competing fixed bottom bars on account creation/edit routes and use the same page width and heading for new account forms.
- [x] Verify both paths, private save, publish transition, missing photos, upload retry, return from pricing, and existing listing-edit regression tests. Run TypeScript, scoped lint, and browser checks without saving live data.

User follow-up: removed the account draft-restored notice while keeping draft field restoration. Validation: 49 focused tests pass; TypeScript passes; lint has no errors and only the three existing image-element warnings in the shared listing editor. Reviewed both new-account routes at mobile width without saving data. Regressions cover scoped price labels and saved photo previews after returning from pricing.
