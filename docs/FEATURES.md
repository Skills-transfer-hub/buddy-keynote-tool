# Buddy Keynote Studio — périmètre V2

Relevé fonctionnel et implémentation du 4 septembre 2026. Ce studio reprend les
outils courants d’un éditeur de présentations, pas l’intégralité des suites bureautiques.

## Outils disponibles

| Domaine      | Dans le studio                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documents    | Bibliothèque locale IndexedDB, sauvegarde automatique, récupération des petits documents, migration V1, import/export Buddy JSON                                                                                        |
| Diapositives | Ajout, duplication, suppression, glisser-déposer, trieuse, masquage, 16:9 / 4:3, quatre dispositions de départ                                                                                                          |
| Texte        | Édition directe par double clic, police, taille, graisse, italique, soulignement, alignement, listes, couleur, fond                                                                                                     |
| Objets       | Rectangle, ellipse, triangle, étoile, ligne, flèche, images locales, Buddy, blocs de code, tableaux, graphiques, audio/vidéo par URL directe                                                                            |
| Mise en page | Déplacement, redimensionnement, rotation, position/dimensions numériques, sélection multiple, groupage/dégroupage, alignement, distribution horizontale, grille, magnétisme, calques, verrouillage, visibilité, opacité |
| Code         | Dix langages proposés, coloration syntaxique, numéros de lignes, thème clair/sombre ; le code n’est jamais exécuté                                                                                                      |
| Données      | Cellules de tableau modifiables, ajout/retrait de lignes/colonnes ; barres, courbes et secteurs à plusieurs séries                                                                                                      |
| Thèmes       | Studio clair, éditorial, terminal ; fonds blanc/gris/noir et couleurs de texte adaptées                                                                                                                                 |
| Buddy        | Six transitions de scène ; écriture, dévoilement, apport, accentuation et effacement des objets ; durée, ordre, déclenchement au clic / avec / après le précédent                                                       |
| Présentation | Navigation par étapes, plein écran, écran noir, pointeur, avance automatique, réduction des mouvements selon préférence système                                                                                         |
| Régie        | Fenêtre audience séparée, notes privées, prochaine diapositive, chronomètre, saut vers une diapositive                                                                                                                  |
| Fichiers     | Buddy JSON, HTML autonome avec Buddy, impression/PDF via le navigateur, export/import PPTX et ODP simplifiés                                                                                                            |

Buddy reste la mascotte ASCII canonique STH. Il suit le bord de la scène déplacée
et le curseur réel du texte, y compris les retours à la ligne. Les effets simultanés
ont chacun leur Buddy. Les graphiques n’ont pas de moteur d’animation indépendant.

## Compatibilité et limites

- Le fichier Buddy conserve la structure et les animations maison. La sauvegarde
  locale appartient à ce navigateur et à cette origine ; elle n’est pas une synchronisation cloud.
- Les exports PPTX conservent les objets pris en charge comme objets éditables et
  les notes. Les effets Buddy ne sont pas des animations Office natives.
- L’ODP est une conversion simplifiée : les graphiques sont représentés par leurs
  données textuelles ; certains objets et médias deviennent des cadres/descriptions.
- Les imports Office reprennent les textes, formes, images embarquées et tableaux
  pris en charge. Masques, groupes complexes, animations, polices, graphiques et
  styles avancés peuvent être simplifiés ou ignorés. Un avertissement est affiché.
- Les images liées/externes Office ne sont pas récupérées automatiquement. Les
  imports refusent les entités XML, chemins ZIP dangereux et archives hors limites.
- L’HTML comprend le contenu local et son lecteur ; les médias/images par URL
  restent dépendants de cette URL. Les polices utilisent les équivalents disponibles
  sur l’appareil. L’audio/vidéo HTML est lancé manuellement.
- Limites : 250 diapositives, 300 objets par diapositive, images locales de 5 Mo,
  archives Office de 30 Mo. L’impression exclut les diapositives masquées.
- La régie utilise `BroadcastChannel` et une fenêtre autorisée par le navigateur.
  Aucun serveur de diffusion distante n’est inclus.

Non inclus : coédition et commentaires multi-utilisateurs, comptes/bibliothèque cloud,
masques éditables hérités, SmartArt, équations, morphing, trajectoires libres, objets 3D,
dessin vectoriel avancé, enregistrement vidéo, sous-titrage en direct, macros,
lecture/import du format Apple `.key`, anciens formats binaires `.ppt` et `.sxi`.

## Références officielles étudiées

- [Guide Keynote pour Mac](https://support.apple.com/fr-fr/guide/keynote/welcome/mac) : objets, thèmes, dispositions, transitions et présentation.
- [Animations Keynote](https://support.apple.com/fr-fr/guide/keynote/tan115e144b4/mac) et [écran de l’intervenant](https://support.apple.com/fr-fr/guide/keynote/tan1cb6ca7a3/mac).
- [Comparaison des fonctions PowerPoint selon les plateformes](https://support.microsoft.com/en-us/powerpoint/compare-powerpoint-features-on-different-platforms).
- [Volet de sélection PowerPoint](https://support.microsoft.com/en-us/powerpoint/use-the-selection-pane-to-manage-objects-in-documents) et [animations multiples](https://support.microsoft.com/en-us/powerpoint/apply-multiple-animation-effects-to-one-object).
- [Présentation officielle Apache OpenOffice](https://www.openoffice.org/product/) et [guide Impress](https://wiki.openoffice.org/wiki/Documentation/AOO4_User_Guides/Getting_Started/Getting_Started_with_Impress/What_Is_Impress%3F).
- [Animations Impress](https://help.libreoffice.org/latest/en-US/text/simpress/01/06060000.html) et [console de présentation](https://help.libreoffice.org/latest/en-US/text/simpress/guide/presenter_console.html).

## Vérification

`npm test` couvre le schéma, la migration V1, les entrées malformées, les étapes
d’animation, la bibliothèque locale (IndexedDB simulé), les exports/réimports PPTX
et ODP et les refus ZIP/XML. `npm run lint`, `npx tsc --noEmit` et `npm run build`
vérifient le code et la compilation. Les archives ont été inspectées en mémoire ;
cela ne constitue pas un test dans les applications natives PowerPoint/Keynote/Impress.
Le parcours graphique et le double écran réel restent à valider en usage navigateur.
