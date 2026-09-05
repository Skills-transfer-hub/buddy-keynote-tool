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
| Buddy        | Douze transitions de scène ; apparition et disparition ; quinze mises en évidence ; portées caractère, mot, texte entier et bloc ; durée, ordre, déclenchement au clic / avec / après                                                       |
| Présentation | Navigation par étapes, plein écran, écran noir, pointeur, avance automatique, réduction des mouvements selon préférence système                                                                                         |
| Régie        | Fenêtre audience séparée, notes privées, prochaine diapositive, chronomètre, saut vers une diapositive                                                                                                                  |
| Fichiers     | Buddy JSON, HTML autonome avec Buddy, impression/PDF via le navigateur, export/import PPTX et ODP simplifiés                                                                                                            |

Buddy conserve sa silhouette ASCII STH, sans membres ajoutés. Son corps prend
appui, se comprime et relâche l’effort ; le contenu bouge au contact. Le crayon,
le rouleau et la gomme restent attachés à son corps. Le texte apparaît sous la
pointe, avec une levée entre les caractères et les lignes, y compris dans le code.
Les accents combinés et les emojis composés restent des caractères entiers.
Les effets simultanés ont chacun leur Buddy. Le lecteur et l’export HTML utilisent
le même calcul pour le contenu, les contacts et les outils. Le tampon imprime au
choc ; l’aimant transporte les mots attachés ; les dominos se transmettent la
poussée au contact ; le texte gonfle uniquement quand Buddy abaisse le piston.
Les graphiques n’ont pas de moteur d’animation indépendant.

## Effets de texte et portées

- Transitions : clap, poussée, balayage, soulèvement, souffle, ouverture circulaire,
  traction, rideau central, page tournée, chute amortie, enroulement et zip diagonal.
- Apparition et disparition : écriture, rouleau, portage, tampon, rebond,
  aimant, ruban, éclairage, dominos et gonflage. Une apparition commence sans
  aucun pixel de texte, y compris pendant la préparation de Buddy ; une
  disparition conserve le texte initial puis le retire entièrement.
- Portées : caractère (graphème Unicode), mot, texte entier (encre de toutes les
  lignes), bloc complet (objet avec son fond et sa boîte). Les portées caractère
  et mot avancent unité par unité ; le texte entier et le bloc agissent ensemble.
- Quinze mises en évidence : soulignement, surligneur, cercle, cadre, double
  soulignement, soulignement ondulé, crochets, flèche, projecteur, couleur peinte,
  lueur, pulsation, balancement, petit saut et étirement. Le texte reste visible.
  Les annotations et la couleur restent ; les déformations reviennent à leur
  géométrie d’origine. Buddy lève son outil entre les mots et les traits.
- Le panneau Animer sépare type d’effet, portée et geste. La durée conseillée
  tient compte du nombre d’unités et reste modifiable jusqu’à 60 secondes.
- Les champs optionnels `animationMode` et `animationScope` restent dans le
  schéma V2. Les fichiers anciens reçoivent des valeurs compatibles à l’import ;
  les nouvelles valeurs sont conservées par la bibliothèque, le JSON et le HTML.
- Un seul effet est attaché à chaque objet, avec son ordre et son déclenchement.
  Le lecteur et l’export autonome utilisent exactement le même moteur.

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
et ODP et les refus ZIP/XML. Les tests de gestuelle couvrent les contacts,
rotations, formats, continuité de la pointe et exécution du lecteur HTML autonome.
`npm run lint`, `npx tsc --noEmit` et `npm run build`
vérifient le code et la compilation. Les archives ont été inspectées en mémoire ;
cela ne constitue pas un test dans les applications natives PowerPoint/Keynote/Impress.
Le parcours graphique et le double écran réel restent à valider en usage navigateur.

## Projets partagés

- **Partager → Créer le projet partagé** conserve l’original local et crée une version commune sur le serveur.
- Copier le lien « Peut modifier » pour travailler ensemble, ou « Peut consulter » pour un accès en lecture seule. Les modifications et la présence sont synchronisées toutes les 1,5 secondes environ.
- Le propriétaire peut révoquer les liens et en créer de nouveaux. L’ancien lien cesse de fonctionner à la prochaine requête. Un prénom est un nom d’affichage, pas une identité vérifiée.
- L’annulation d’un éditeur conserve les modifications des autres. Les textes, objets et propriétés sont fusionnés ; les suppressions restent des suppressions.
- **Enregistré sur le serveur** confirme la sauvegarde commune. En cas de coupure, les modifications sont conservées dans une copie de secours par session et fusionnées à la reconnexion. Le fichier Buddy reste exportable.
- Les projets déjà ouverts se retrouvent dans **Mes présentations**. Les liens de récupération sont propres à ce navigateur ; conserver son lien permet de retrouver le projet sur un autre ordinateur.
- Les liens de localhost nécessitent le même serveur local. Le travail entre ordinateurs requiert une adresse hébergée commune et l’autorisation d’accéder au Site. Un lien de projet ne contourne pas les restrictions du Site.
- Taille maximale d’un état partagé : 16 Mo, images incluses. Les médias doivent être intégrés ou utiliser une URL accessible aux participants ; les adresses temporaires `blob:` ne peuvent pas être partagées.

Stockage : métadonnées, droits et présence dans D1 ; états Yjs dans R2. Les secrets des liens sont uniquement hachés en base. Aucun changement du format des fichiers Buddy.

Initialisation locale : `npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc`, puis `npm run dev -- --port 3001`. Validation du serveur local : `node --experimental-strip-types qa/check-collaboration.ts`.
