# Buddy Keynote Studio

Éditeur de présentations STH dans le navigateur. La mascotte Buddy agit à l’écran
sur les transitions, les textes et les objets. Canvas libre, formes, images, code,
tableaux, graphiques, thèmes contrastés et régie multi-fenêtres.

## Développement

```bash
npm install
npm run dev
```

La bibliothèque est sauvegardée localement dans IndexedDB, avec migration des
présentations V1. Exportez un `*.buddydeck.json` pour sauvegarder/transférer le
document complet, ou un HTML autonome pour le présenter. Les conversions PPTX/ODP
sont partielles. Le menu d’impression permet d’enregistrer un PDF.

Voir [le périmètre fonctionnel et les sources](docs/FEATURES.md) pour les outils
disponibles, limites de compatibilité et fonctions non incluses.

## Vérification

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Raccourcis

- `⌘/Ctrl + Entrée` : présenter depuis la diapositive sélectionnée.
- `⌘/Ctrl + D` : dupliquer la sélection, ou la diapositive sans objet sélectionné.
- `⇧ + clic` : sélection multiple ; `⌘/Ctrl + G` : grouper ; ajouter `⇧` pour dégrouper.
- `⌘/Ctrl + C / V` : copier/coller les objets dans le studio.
- Flèches : déplacer les objets ; `⇧` pour un pas plus grand.
- Double clic sur un texte : édition directe.
- `⌘/Ctrl + Z` / `⇧ + ⌘/Ctrl + Z` : annuler / rétablir.
- `⌥/Alt + ↑` / `⌥/Alt + ↓` : réordonner la diapositive.
- En présentation : `Espace` ou les flèches pour naviguer, `B` pour l’écran
  noir, `L` pour le pointeur, `F` pour le plein écran et `Échap` pour quitter.
- Un premier clic pendant une animation la termine ; le clic suivant passe à
  l’étape ou à la diapositive suivante.
