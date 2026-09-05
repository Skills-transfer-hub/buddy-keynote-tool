import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
  Zip,
  ZipDeflate,
} from 'fflate';
import {
  initialDeck,
  makeElement,
  migrateDeck,
  type Deck,
} from '../lib/studio.ts';
import { exportOdp, exportPptx, importOffice } from '../lib/office.ts';

const window = new JSDOM('').window;
Object.defineProperty(globalThis, 'DOMParser', {
  value: window.DOMParser,
  configurable: true,
});

function sample(): Deck {
  const deck = structuredClone(initialDeck);
  const shape = makeElement('shape');
  const table = makeElement('table');
  const chart = makeElement('chart');
  const image = makeElement('image');
  if (image.kind === 'image')
    image.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE2kAAAAASUVORK5CYII=';
  deck.slides = [
    {
      ...deck.slides[0],
      name: 'Édition & données',
      notes: 'Notes de régie : garder une pause.',
      elements: [
        ...deck.slides[0].elements,
        shape,
        table,
        chart,
        image,
        makeElement('code'),
      ],
    },
  ];
  return deck;
}

void test('PPTX : objets éditables, image, graphique et notes puis réimport valide', async () => {
  const blob = await exportPptx(sample());
  assert.equal(
    blob.type,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.ok(entries['ppt/slides/slide1.xml']);
  assert.ok(entries['ppt/charts/chart1.xml']);
  assert.match(
    strFromU8(entries['ppt/notesSlides/notesSlide1.xml']),
    /Notes de régie/,
  );
  assert.ok(Object.keys(entries).some((path) => path.startsWith('ppt/media/')));
  assert.match(
    strFromU8(entries['ppt/slides/slide1.xml']),
    /Le savoir circule/,
  );
  const result = await importOffice(new File([blob], 'test.pptx'));
  assert.ok(migrateDeck(result.deck), JSON.stringify(result.deck));
  assert.equal(result.deck.slides.length, 1);
  assert.ok(
    result.deck.slides[0].elements.some(
      (element) =>
        element.kind === 'text' && element.text.includes('Le savoir circule'),
    ),
  );
  assert.ok(result.warnings.length, 'L’import partiel doit être explicite.');
});

void test('ODP : paquet valide, objets et notes puis réimport sans corruption', async () => {
  const blob = exportOdp(sample());
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(
    strFromU8(entries.mimetype),
    'application/vnd.oasis.opendocument.presentation',
  );
  const xml = strFromU8(entries['content.xml']);
  assert.match(xml, /Le savoir circule/);
  assert.match(xml, /Notes de régie/);
  const doc = new window.DOMParser().parseFromString(xml, 'application/xml');
  assert.equal(doc.getElementsByTagName('parsererror').length, 0);
  const result = await importOffice(new File([blob], 'test.odp'));
  assert.ok(migrateDeck(result.deck), JSON.stringify(result.deck));
  assert.equal(result.deck.slides.length, 1);
  assert.ok(
    result.deck.slides[0].elements.some(
      (element) =>
        element.kind === 'text' && element.text.includes('Le savoir circule'),
    ),
  );
});

void test('Office refuse les entités XML et les chemins ZIP dangereux', async () => {
  const ordinary = unzipSync(
    new Uint8Array(await exportOdp(sample()).arrayBuffer()),
  );
  ordinary['content.xml'] = strToU8(
    '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>',
  );
  const xmlAttack = zipSync(ordinary);
  await assert.rejects(
    importOffice(new File([Uint8Array.from(xmlAttack)], 'evil.odp')),
    /entité interdite/,
  );
  const pathAttack = zipSync({ '../escape.xml': strToU8('x') });
  await assert.rejects(
    importOffice(new File([Uint8Array.from(pathAttack)], 'evil.pptx')),
    /chemin ZIP dangereux/,
  );
});

function declaredZipSize(archive: Uint8Array, size: number, local = true) {
  const bytes = Uint8Array.from(archive);
  const view = new DataView(bytes.buffer);
  for (let offset = 0; offset <= bytes.length - 30; offset++) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50) view.setUint32(offset + 24, size, true);
    if (local && signature === 0x04034b50)
      view.setUint32(offset + 22, size, true);
  }
  return bytes;
}

void test('Office arrête une bombe DEFLATE dont la taille déclarée est falsifiée', async () => {
  // About 8 KiB compressed, but 8 MiB of actual output. A fixed-size inflate
  // buffer silently truncates this payload and still processes all its bytes.
  const archive = zipSync({ 'content.xml': new Uint8Array(8 * 1024 * 1024) });
  const forged = declaredZipSize(archive, 8192);
  await assert.rejects(
    importOffice(new File([forged], 'forged.odp')),
    /taille ZIP incohérente/,
  );
});

void test('Office refuse les tailles finales et les en-têtes ZIP incohérents', async () => {
  const content = strToU8('<office/>');
  const archive = zipSync({ 'content.xml': content });
  await assert.rejects(
    importOffice(
      new File([declaredZipSize(archive, content.length + 1)], 'long.odp'),
    ),
    /taille ZIP incohérente/,
  );
  await assert.rejects(
    importOffice(
      new File(
        [declaredZipSize(archive, content.length + 1, false)],
        'headers.odp',
      ),
    ),
    /en-têtes ZIP incohérents/,
  );
});

void test('Office accepte les ZIP avec descripteurs de données', async () => {
  const ordinary = unzipSync(
    new Uint8Array(await exportOdp(sample()).arrayBuffer()),
  );
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    assert.ifError(error);
    chunks.push(chunk);
  });
  for (const [name, content] of Object.entries(ordinary)) {
    const entry = new ZipDeflate(name);
    zip.add(entry);
    entry.push(content, true);
  }
  zip.end();
  const archive = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.length;
  }
  const result = await importOffice(new File([archive], 'streamed.odp'));
  assert.ok(migrateDeck(result.deck));
  assert.equal(result.deck.slides.length, 1);
});

void test('Office respecte une annulation avant de lire le fichier', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    importOffice(new File(['unread'], 'cancel.odp'), controller.signal),
    { name: 'AbortError' },
  );
});
