import 'server-only';

const VIDNEST_ALPHABET = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=';

interface VidNestCipherEnvelope {
  data?: string;
  encrypted?: boolean;
}

function decodeVidNestString(value: string, alphabet = VIDNEST_ALPHABET): string {
  const lookup = new Map<string, number>();

  for (let index = 0; index < alphabet.length; index += 1) {
    lookup.set(alphabet[index], index);
  }

  const bytes: number[] = [];

  for (let cursor = 0; cursor < value.length; cursor += 4) {
    let chunk = value.slice(cursor, cursor + 4);
    while (chunk.length < 4) {
      chunk += '=';
    }

    const values = chunk.split('').map((character) => {
      const decoded = lookup.get(character);
      return decoded === undefined ? 64 : decoded;
    });

    bytes.push((values[0] << 2) | (values[1] >> 4));

    if (values[2] !== 64) {
      bytes.push(((values[1] & 15) << 4) | (values[2] >> 2));
    }

    if (values[3] !== 64) {
      bytes.push(((values[2] & 3) << 6) | values[3]);
    }
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function decodeVidNestPayload<T>(payload: unknown): T {
  const envelope = payload as VidNestCipherEnvelope;

  if (!envelope?.encrypted) {
    return payload as T;
  }

  if (typeof envelope.data !== 'string' || !envelope.data.trim()) {
    throw new Error('VidNest encrypted payload was empty.');
  }

  const decoded = decodeVidNestString(envelope.data, VIDNEST_ALPHABET);

  try {
    return JSON.parse(decoded) as T;
  } catch {
    throw new Error('VidNest encrypted payload could not be parsed.');
  }
}
