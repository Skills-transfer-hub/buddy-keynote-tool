# Buddy Keynote Studio

Éditeur de présentations STH dans le navigateur. La mascotte Buddy agit à l’écran
sur les transitions, les textes et les objets. Canvas libre, formes, images, code,
tableaux, graphiques, thèmes contrastés et régie multi-fenêtres.

## Développement

```bash
npm install
cp .env.example .env.local
npm run dev
```

La bibliothèque est sauvegardée localement dans IndexedDB, avec migration des
présentations V1. Exportez un `*.buddydeck.json` pour sauvegarder/transférer le
document complet, ou un HTML autonome pour le présenter. Les conversions PPTX/ODP
sont partielles. Le menu d’impression permet d’enregistrer un PDF.

Sans configuration Supabase, toutes les fonctions locales restent disponibles.
Pour synchroniser une présentation entre appareils et collaborateurs, ouvrez
**Partager**, saisissez le code privé de votre déploiement, puis utilisez les
liens propriétaire, édition ou lecture. La synchronisation fusionne les
modifications avec Yjs et conserve une copie locale pour reprendre après une
coupure. Le propriétaire peut renouveler les liens invités.

## Déployer sur Vercel et Supabase

Le projet utilise Next.js et un serveur Node.js standard. Aucune ressource
Cloudflare, intégration OpenAI ou clé d’IA n’est nécessaire.

1. Forkez ce dépôt, puis créez un projet Supabase dédié.
2. Exécutez le fichier SQL de `supabase/migrations/` dans le SQL Editor de votre
   projet. Il crée uniquement le schéma `buddy_keynote` et le rôle dédié.
3. Attribuez un mot de passe aléatoire au rôle depuis le SQL Editor :

   ```sql
   ALTER ROLE buddy_keynote_app PASSWORD 'REPLACE_WITH_A_RANDOM_PASSWORD';
   ```

4. Dans Supabase **Connect**, copiez la connexion du **Transaction pooler**
   (port 6543). Remplacez `postgres.PROJECT_REF` par
   `buddy_keynote_app.PROJECT_REF` et utilisez le mot de passe de ce rôle.
   Dans **Database > Settings > SSL configuration**, téléchargez le certificat
   racine et activez l’obligation SSL. Copiez le PEM dans `BUDDY_DATABASE_CA`.
5. Importez le dépôt dans Vercel, preset **Next.js**, Node.js **24.x**, et ajoutez
   les variables **Production** suivantes :

   | Variable | Valeur |
   | --- | --- |
   | `BUDDY_DATABASE_URL` | Connexion du rôle dédié, jamais celle de `postgres` |
   | `BUDDY_CREATE_KEY` | Code aléatoire privé : `openssl rand -hex 24` |
   | `BUDDY_APP_ORIGIN` | Origine publique, par exemple `https://your-app.vercel.app` |
   | `BUDDY_DATABASE_CA` | Facultatif : certificat racine PEM si nécessaire |

6. Déployez. Ouvrez **Partager**, créez un document avec votre code, puis ouvrez
   son lien de lecture dans un autre navigateur. Les modifications doivent s’y
   propager, et le lien de lecture doit refuser l’écriture.

Gardez des données et codes distincts pour les previews. Ne donnez aucun secret
de production aux builds de pull requests externes. Pour une installation locale,
les mêmes variables vont dans `.env.local`, qui est ignoré par Git.

La limite est de 3 Mo par document partagé, 100 documents et 300 Mo au total.
La bibliothèque locale ne devient pas automatiquement une bibliothèque cloud :
chaque présentation doit être partagée explicitement. Gardez vos liens
propriétaires et des exports de sauvegarde ; il n’existe pas de récupération par
compte. Les anciens liens d’un autre hébergement ne sont pas migrés automatiquement.

Les règles d’accès, limites et précautions sont décrites dans [SECURITY.md](SECURITY.md).
Licence [MIT](LICENSE).

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
