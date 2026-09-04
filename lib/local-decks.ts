import { migrateDeck, type Deck } from './studio.ts';

const DB_NAME = 'buddy-keynote-studio';
const LAST_DECK_KEY = 'buddy-keynote-active';
const JOURNAL_KEY = 'buddy-keynote-recovery';
let database: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

function openStore(): Promise<IDBDatabase> {
  if (database) return Promise.resolve(database);
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('decks', { keyPath: 'id' });
    request.onsuccess = () => {
      database = request.result;
      database.onversionchange = () => {
        database?.close();
        database = null;
        opening = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error('Stockage indisponible.'));
    };
  });
  return opening;
}

function writeDeck(db: IDBDatabase, deck: Deck): Promise<void> {
  // Start the transaction synchronously when the cached connection exists,
  // including during pagehide. Small decks also have a synchronous journal.
  return new Promise((resolve, reject) => {
    const tx = db.transaction('decks', 'readwrite');
    tx.objectStore('decks').put(deck);
    tx.oncomplete = () => {
      try {
        localStorage.setItem(LAST_DECK_KEY, deck.id);
        const journal = localStorage.getItem(JOURNAL_KEY);
        if (journal) {
          const saved = JSON.parse(journal) as Deck;
          if (saved.id === deck.id && saved.updatedAt === deck.updatedAt)
            localStorage.removeItem(JOURNAL_KEY);
        }
      } catch {
        /* IndexedDB remains durable. */
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function saveLocalDeck(deck: Deck): Promise<void> {
  try {
    const json = JSON.stringify(deck);
    if (json.length <= 2_000_000) localStorage.setItem(JOURNAL_KEY, json);
    localStorage.setItem(LAST_DECK_KEY, deck.id);
  } catch {
    /* Storage quota/privacy modes can disable the recovery journal. */
  }
  return database
    ? writeDeck(database, deck)
    : openStore().then((db) => writeDeck(db, deck));
}

export async function listLocalDecks(): Promise<Deck[]> {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const request = db.transaction('decks').objectStore('decks').getAll();
    request.onsuccess = () =>
      resolve(
        request.result
          .map(migrateDeck)
          .filter((deck): deck is Deck => deck !== null)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    request.onerror = () => reject(request.error);
  });
}

export async function restoreLocalDeck(): Promise<Deck | null> {
  let active: string | null = null;
  let recovery: Deck | null = null;
  let legacy: string | null = null;
  try {
    active = localStorage.getItem(LAST_DECK_KEY);
    legacy = localStorage.getItem('sth-buddy-keynote-v1');
    const journal = localStorage.getItem(JOURNAL_KEY);
    if (journal) recovery = migrateDeck(JSON.parse(journal));
  } catch {
    /* Try IndexedDB even if localStorage is unavailable. */
  }
  let decks: Deck[] = [];
  let storageError: unknown;
  try {
    decks = await listLocalDecks();
  } catch (error) {
    storageError = error;
  }
  const saved = decks.find((deck) => deck.id === active) ?? decks[0] ?? null;
  if (
    recovery &&
    (!saved ||
      (recovery.id === saved.id && recovery.updatedAt >= saved.updatedAt))
  )
    return recovery;
  if (saved) return saved;
  if (legacy) {
    const migrated = migrateDeck(JSON.parse(legacy));
    if (!migrated)
      throw new Error(
        'La présentation locale existante n’a pas pu être convertie.',
      );
    // Always return the original content, even when its new storage is denied.
    void saveLocalDeck(migrated).catch(() => undefined);
    return migrated;
  }
  if (storageError) throw storageError;
  return null;
}
