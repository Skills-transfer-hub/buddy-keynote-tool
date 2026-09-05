# Comparatif Buddy

Ouvrir **buddy-comparatif.html** dans un navigateur. Ce fichier autonome embarque les styles, le moteur et la mascotte. Il fonctionne hors ligne, sans installation ni accès aux présentations.

Trois versions synchronisées : ASCII articulé, silhouette sans membres, mascotte illustrée. Une séquence de 14,4 secondes : appui et poussée de la slide, saisie du crayon, tracé de « Bonjour », levée et observation.

Commandes communes : lecture/pause, rejouer, vitesse 1×/½×/¼×, curseur temporel, accès aux deux actions. Espace contrôle la lecture et les flèches avancent/reculent de 0,1 seconde lorsque le focus n’est pas dans une commande. Le choix A/B/C reste uniquement dans la page ouverte.

## Sources

- `motion.mjs` : géométrie, contacts, traits du mot et appuis déterministes.
- `app.mjs` : rendu des trois marionnettes et commandes.
- `index.html`, `style.css` : surface de comparaison.
- `mascot-sheet.png` : illustration originale générée pour la troisième version, découpée et articulée au rendu.

Le visage ASCII est conservé. Son contour est rendu en géométrie vectorielle pour garder un bord de contact précis, indépendamment des métriques de la police.

Recréer le fichier autonome : `node comparison/build.mjs` depuis la racine du projet.

Vérifier les contacts et la chronologie : `node --test comparison/motion.test.mjs`.

`check-browser.mjs` est le contrôle local utilisé pour les commandes et captures dans Chromium. Il utilise le Playwright déjà fourni par l’environnement Codex et le serveur local sur le port 4175. Les images de contrôle sont dans `checks/`.

Aucun import depuis l’éditeur, aucune écriture dans son stockage, aucune modification de son format ni publication.
