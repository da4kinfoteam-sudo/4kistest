type ResponseLike = {
  clone?: () => ResponseLike;
  json?: () => Promise<unknown>;
  text?: () => Promise<unknown>;
};

const MAX_MESSAGE_LENGTH = 500;

function limitMessage(value: string): string | null {
  const message = value.trim();
  if (!message) return null;
  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : message;
}

function messageFromPayload(payload: unknown): string | null {
  if (typeof payload === 'string') return limitMessage(payload);
  if (!payload || typeof payload !== 'object') return null;

  const candidate = payload as { error?: unknown; message?: unknown };
  if (typeof candidate.error === 'string') return limitMessage(candidate.error);
  if (typeof candidate.message === 'string') return limitMessage(candidate.message);
  return null;
}

async function readResponse(response: ResponseLike): Promise<string | null> {
  const candidates: ResponseLike[] = [];

  if (typeof response.clone === 'function') {
    try {
      candidates.push(response.clone());
    } catch {
      // A consumed response cannot be cloned; try the original below.
    }
  }
  candidates.push(response);

  for (const candidate of candidates) {
    if (typeof candidate.text === 'function') {
      try {
        const raw = await candidate.text();
        if (typeof raw === 'string' && raw.trim()) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            const parsedMessage = messageFromPayload(parsed);
            if (parsedMessage) return parsedMessage;
          } catch {
            // Plain-text function errors are valid responses.
          }
          const textMessage = messageFromPayload(raw);
          if (textMessage) return textMessage;
        }
      } catch {
        // Try the JSON reader or the next response candidate.
      }
    }

    if (typeof candidate.json === 'function') {
      try {
        const parsedMessage = messageFromPayload(await candidate.json());
        if (parsedMessage) return parsedMessage;
      } catch {
        // The body may be empty, malformed, or already consumed.
      }
    }
  }

  return null;
}

/** Extracts only a safe, user-facing message from a Supabase Functions error. */
export async function extractUserAdminError(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') return null;
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object') return null;
  return readResponse(context as ResponseLike);
}
