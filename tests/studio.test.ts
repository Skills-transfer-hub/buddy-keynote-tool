import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initialDeck,
  makeElement,
  makeSlide,
  migrateDeck,
  type Deck,
  type Slide,
} from '../lib/studio.ts';
import {
  animationGroups,
  groupDuration,
  nextVisibleIndex,
} from '../lib/playback.ts';

function legacyDeck() {
  return {
    schemaVersion: 1,
    id: 'legacy-deck',
    title: 'Présentation historique',
    updatedAt: '2026-09-04T12:00:00.000Z',
    slides: [
      {
        id: 'legacy-opening',
        eyebrow: 'OUVERTURE',
        title: 'Le savoir circule.',
        body: 'Les équipes avancent.',
        transition: 'push',
        textAnimation: 'reveal',
        tone: 'paper',
        layout: 'headline',
        notes: 'Faire une pause.',
      },
      {
        id: 'legacy-buddy',
        eyebrow: 'BUDDY',
        title: 'Chaque mouvement a une intention.',
        body: 'Buddy dirige la scène.',
        transition: 'lift',
        textAnimation: 'type',
        tone: 'ink',
        layout: 'split',
        notes: '',
      },
    ],
  };
}

function validDeck(): Deck {
  return structuredClone(initialDeck);
}

function playbackSlide(): Slide {
  const slide = makeSlide();
  slide.elements = [];

  const click = makeElement('text');
  click.id = 'click';
  click.animation = 'reveal';
  click.animationOrder = 0;
  click.animationTrigger = 'click';
  click.animationDuration = 400;
  click.z = 1;

  const withPrevious = makeElement('shape');
  withPrevious.id = 'with';
  withPrevious.animation = 'rise';
  withPrevious.animationOrder = 1;
  withPrevious.animationTrigger = 'with';
  withPrevious.animationDuration = 700;
  withPrevious.z = 2;

  const afterPrevious = makeElement('buddy');
  afterPrevious.id = 'after';
  afterPrevious.animation = 'emphasis';
  afterPrevious.animationOrder = 2;
  afterPrevious.animationTrigger = 'after';
  afterPrevious.animationDuration = 300;
  afterPrevious.z = 3;

  const secondClick = makeElement('code');
  secondClick.id = 'second-click';
  secondClick.animation = 'exit';
  secondClick.animationOrder = 3;
  secondClick.animationTrigger = 'click';
  secondClick.animationDuration = 500;
  secondClick.z = 4;

  const ignored = makeElement('image');
  ignored.id = 'ignored';
  ignored.animation = 'reveal';
  ignored.animationOrder = 4;
  ignored.animationTrigger = 'after';
  ignored.hidden = true;

  slide.elements = [secondClick, ignored, afterPrevious, click, withPrevious];
  return slide;
}

void test('le deck initial respecte le schéma V2', () => {
  const migrated = migrateDeck(initialDeck);

  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.slides.length, 3);
  assert.notStrictEqual(
    migrated,
    initialDeck,
    'la validation doit produire une copie assainie',
  );
});

void test('migrateDeck convertit un deck V1 sans perdre son contenu', () => {
  const migrated = migrateDeck(legacyDeck());

  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.id, 'legacy-deck');
  assert.equal(migrated.title, 'Présentation historique');
  assert.equal(migrated.theme, 'studio');
  assert.equal(migrated.aspectRatio, '16:9');
  assert.equal(migrated.slides.length, 2);
  assert.equal(migrated.slides[0].transition, 'push');
  assert.equal(migrated.slides[0].notes, 'Faire une pause.');
  assert.deepEqual(
    migrated.slides[0].elements
      .filter((element) => element.kind === 'text')
      .map((element) => element.text),
    ['OUVERTURE', 'Le savoir circule.', 'Les équipes avancent.'],
  );
  assert.ok(
    migrated.slides[1].elements.some((element) => element.kind === 'buddy'),
  );

  const ids = [
    migrated.id,
    ...migrated.slides.flatMap((slide) => [
      slide.id,
      ...slide.elements.map((element) => element.id),
    ]),
  ];
  assert.equal(
    new Set(ids).size,
    ids.length,
    'tous les IDs doivent être uniques',
  );
});

void test('migrateDeck rejette les imports malformés ou hors limites', () => {
  assert.equal(migrateDeck(null), null);
  assert.equal(migrateDeck({}), null);
  assert.equal(migrateDeck({ schemaVersion: 99 }), null);

  const duplicateSlide = validDeck();
  duplicateSlide.slides[1].id = duplicateSlide.slides[0].id;
  assert.equal(migrateDeck(duplicateSlide), null, 'ID de slide dupliqué');

  const duplicateElement = validDeck();
  duplicateElement.slides[1].elements[0].id =
    duplicateElement.slides[0].elements[0].id;
  assert.equal(
    migrateDeck(duplicateElement),
    null,
    'ID d’élément dupliqué entre slides',
  );

  const invalidTransition = validDeck();
  Object.assign(invalidTransition.slides[0], { transition: 'magic' });
  assert.equal(migrateDeck(invalidTransition), null, 'transition inconnue');

  const invalidDuration = validDeck();
  invalidDuration.slides[0].transitionDuration = Number.NaN;
  assert.equal(migrateDeck(invalidDuration), null, 'durée non finie');

  const invalidGeometry = validDeck();
  invalidGeometry.slides[0].elements[0].x = 101;
  assert.equal(migrateDeck(invalidGeometry), null, 'géométrie hors canevas');

  const invalidAsset = validDeck();
  const image = makeElement('image');
  image.src = 'javascript:alert(1)';
  invalidAsset.slides[0].elements.push(image);
  assert.equal(migrateDeck(invalidAsset), null, 'source de média dangereuse');

  const malformedLegacy = legacyDeck();
  malformedLegacy.slides[0].textAnimation = 'spin';
  assert.equal(migrateDeck(malformedLegacy), null, 'animation V1 inconnue');
});

void test('nextVisibleIndex saute les diapositives masquées dans les deux sens', () => {
  const slides = [
    makeSlide('Une'),
    makeSlide('Deux'),
    makeSlide('Trois'),
    makeSlide('Quatre'),
  ];
  slides[1].hidden = true;
  slides[2].hidden = true;

  assert.equal(nextVisibleIndex(slides, 0, 1), 3);
  assert.equal(nextVisibleIndex(slides, 3, -1), 0);
  assert.equal(nextVisibleIndex(slides, 3, 1), null);
  assert.equal(nextVisibleIndex(slides, 0, -1), null);
});

void test('animationGroups respecte click, with et after', () => {
  const groups = animationGroups(playbackSlide());

  assert.equal(
    groups.length,
    3,
    'groupe automatique vide, premier clic, second clic',
  );
  assert.deepEqual(groups[0], []);
  assert.deepEqual(
    groups[1].map((cue) => ({
      id: cue.element.id,
      start: cue.start,
      end: cue.end,
    })),
    [
      { id: 'click', start: 0, end: 400 },
      { id: 'with', start: 0, end: 700 },
      { id: 'after', start: 700, end: 1000 },
    ],
  );
  assert.deepEqual(
    groups[2].map((cue) => ({
      id: cue.element.id,
      start: cue.start,
      end: cue.end,
    })),
    [{ id: 'second-click', start: 0, end: 500 }],
  );
  assert.ok(groups.flat().every((cue) => cue.element.id !== 'ignored'));
});

void test('groupDuration retourne la fin du cue le plus long du groupe', () => {
  const slide = playbackSlide();

  assert.equal(groupDuration(slide, 0), 0);
  assert.equal(groupDuration(slide, 1), 1000);
  assert.equal(groupDuration(slide, 2), 500);
  assert.equal(groupDuration(slide, 99), 0);
});
