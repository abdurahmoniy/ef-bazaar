export const MAILBOX_NAME_MAX_LENGTH = 60;

/** Save the owner's label without changing the mailbox address. */
export async function saveMailboxName(mailboxId: string, name: string): Promise<void> {
  const displayName = name.trim();
  if (displayName.length > MAILBOX_NAME_MAX_LENGTH) {
    throw new Error(`Nom ${MAILBOX_NAME_MAX_LENGTH} ta belgidan oshmasin.`);
  }

  let response: Response;
  try {
    response = await fetch(`/api/trade/v1/mailboxes/${encodeURIComponent(mailboxId)}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
  } catch {
    throw new Error("Serverga ulanib bo'lmadi. Qayta urinib ko'ring.");
  }

  if (response.status === 401) {
    throw new Error('Hisobingizga qayta kiring va yana urinib ko‘ring.');
  }
  if (response.status !== 204) {
    throw new Error('Pochta nomi saqlanmadi. Qayta urinib ko‘ring.');
  }
}
