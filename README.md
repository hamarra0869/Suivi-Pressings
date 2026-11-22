# DEKROU PRESSING — Suivi des dépôts

Application web (PWA) de gestion des dépôts de pressing avec envoi de reçus WhatsApp.
Chaque pressing saisit son nom, son téléphone et son adresse (⚙️ Réglages) : ils apparaissent sur ses reçus.
Les données restent sur l'appareil (localStorage) ; l'application fonctionne hors-ligne.
Une sauvegarde (⚙️ → Sauvegarder / Restaurer) permet de changer de téléphone sans rien perdre.

## Licence PRO

- Essai gratuit : 30 dépôts (constante `FREE_DEPOSITS` dans `app.js`).
- Le pressing envoie son **ID appareil** (`DKX-XXXX-XXXX`) depuis ⚙️ → 🔑 Licence.
- La clé PRO est une signature ECDSA P-256 de cet ID. L'application ne contient que la **clé publique** :
  elle peut vérifier une clé mais pas en fabriquer.
- Les clés sont créées avec le générateur **privé** (fichier HTML contenant la clé privée),
  qui ne doit **jamais** être ajouté à ce dépôt (protégé par `.gitignore`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Interface de l'application |
| `app.js` | Logique de l'application |
| `styles.css` | CSS Tailwind **précompilé** (généré, ne pas éditer à la main) |
| `sw.js` | Service worker (cache hors-ligne) |
| `manifest.webmanifest`, `icon.svg` | Installation sur l'écran d'accueil |

## Régénérer `styles.css`

À faire après avoir ajouté ou modifié des classes Tailwind dans `index.html` :

```bash
npx tailwindcss@3 -c tailwind.config.js -i tailwind.input.css -o styles.css --minify
```

Après une mise à jour, incrémenter `CACHE` dans `sw.js` (ex. `dekrou-v2`).

## Mise en ligne (GitHub Pages)

1. GitHub → **Settings** → **Pages**.
2. *Source* : **Deploy from a branch** ; *Branch* : **main**, dossier **/ (root)** → **Save**.
3. Après 1 à 2 minutes, l'application est disponible sur `https://<utilisateur>.github.io/Suivi-Pressings/`.

Sécurité : une politique CSP n'autorise que les scripts du site lui-même, et tout texte saisi est échappé avant affichage.
