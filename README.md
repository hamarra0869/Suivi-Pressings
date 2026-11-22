# DEKROU PRESSING — Suivi des dépôts

Application web (PWA) de gestion des dépôts de pressing avec envoi de reçus WhatsApp.
Les données restent sur l'appareil (localStorage) ; l'application fonctionne hors-ligne.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Application (HTML + JS) |
| `styles.css` | CSS Tailwind **précompilé** (généré, ne pas éditer à la main) |
| `sw.js` | Service worker (cache hors-ligne) |
| `manifest.webmanifest`, `icon.svg` | Installation sur l'écran d'accueil |

## Régénérer `styles.css`

À faire après avoir ajouté ou modifié des classes Tailwind dans `index.html` :

```bash
npx tailwindcss@3 -c tailwind.config.js -i tailwind.input.css -o styles.css --minify
```

Après une mise à jour, incrémenter `CACHE` dans `sw.js` (ex. `dekrou-v2`).

## Déploiement

Servir le dossier en HTTPS (ex. GitHub Pages). Le service worker ne fonctionne pas en ouvrant le fichier directement (`file://`).
