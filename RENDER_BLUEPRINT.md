# Blueprint de déploiement sur Render

Objectif
- Déployer l'application front-end Vite/React comme site statique sur Render.
- (Optionnel mais recommandé) Déployer un petit Web Service Node (sur Render) qui agit comme proxy sécurisé pour OpenAI afin de ne pas exposer la clé API côté client.
- Configurer les variables d'environnement (Supabase, OpenAI, dev account) et CORS.

Plan résumé
1. Préparer le dépôt (build statique Vite)
2. Créer un service "Static Site" sur Render pour le frontend
3. (Optionnel) Créer un service "Web Service" sur Render pour le proxy OpenAI
4. Configurer les variables d'environnement dans le dashboard Render
5. Configurer Supabase (CORS / buckets publics ou accès signé)
6. Tester et itérer

Prérequis
- Compte Render
- Repo GitHub/GitLab accessible depuis Render
- Clés / URLs : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OPENAI_API_KEY` (pour le proxy), variables de dev optionnelles `VITE_DEV_EMAIL`, `VITE_DEV_PASSWORD`.

Sécurité importante
- NE JAMAIS exposer une `service_role` key Supabase côté client.
- Éviter d'utiliser directement `VITE_OPENAI_API_KEY` dans le client : préférez un proxy serveur qui possède la clé.
- Si l'app doit appeler OpenAI depuis le navigateur, la clé sera visible — attention.

1) Frontend — Static Site (recommandé)
- Service type: Static Site
- Connect: GitHub repo
- Branch: `main` (ou branche souhaitée)
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Env vars (voir section suivante)

2) Optional — Web Service (proxy OpenAI)
- Use this to keep `OPENAI_API_KEY` private and to perform server-side processing (safer, avoid dangerouslyAllowBrowser usage).
- Service type: Web Service
- Environment: Node
- Build command: `npm ci`
- Start command: `node server.js` (ou `npm start`)
- Instance type: Starter (or as needed)
- Set `Secure` / `Private` as needed

Exemple `render.yaml` (Infrastructure as Code)
```yaml
services:
  - type: static
    name: artassist-frontend
    repo: https://github.com/<org>/<repo>
    branch: main
    buildCommand: "npm ci && npm run build"
    publishCommand: ""
    publishDir: dist
    env:
      - key: VITE_SUPABASE_URL
      - key: VITE_SUPABASE_ANON_KEY
      - key: VITE_OPENAI_PROXY_URL # si vous utilisez le proxy

  - type: web_service
    name: artassist-api-proxy
    repo: https://github.com/<org>/<repo>
    branch: main
    buildCommand: "npm ci"
    startCommand: "node server.js"
    env:
      - key: OPENAI_API_KEY
      - key: SUPABASE_SERVICE_ROLE # si nécessaire uniquement pour admin tasks (NE PAS exposer au client)
```

3) Variables d'environnement à ajouter sur Render (Static Site et/ou Web Service selon le rôle)
- Frontend (Static Site):
  - `VITE_SUPABASE_URL` = URL Supabase (ex: https://xyz.supabase.co)
  - `VITE_SUPABASE_ANON_KEY` = anon public key
  - `VITE_DEV_EMAIL` (optionnel)
  - `VITE_DEV_PASSWORD` (optionnel)
  - `VITE_OPENAI_PROXY_URL` (optionnel) — URL publique du proxy Render si utilisé

- Proxy (Web Service):
  - `OPENAI_API_KEY` (NE PAS exposer côté client)
  - `SUPABASE_SERVICE_ROLE` (optionnel, seulement si le proxy doit effectuer des tâches admin)

4) Exemple minimal de `server.js` (proxy OpenAI)
- But: recevoir une requête POST `/analyze` avec `{imageUrl, promptType, lang}` puis appeler OpenAI côté serveur et retourner le résultat.

```javascript
// server.js (exemple minimal)
import express from 'express';
import bodyParser from 'body-parser';
import OpenAI from 'openai';

const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/analyze', async (req, res) => {
  try {
    const { imageUrl, promptType = 'artist', lang = 'fr', instructions = '' } = req.body;

    // Construire prompt selon promptType/lang/instructions - simplifié
    const systemPrompt = `Analyse artistique (${promptType}) en ${lang}` + (instructions ? `\nConsignes: ${instructions}` : '');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please analyze image: ${imageUrl}` }
      ],
      max_tokens: 1000
    });

    res.json({ analysis: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API proxy listening on', port));
```

Remarques pour le proxy:
- Assurez-vous de limiter le CORS aux domaines de votre frontend.
- Ajouter authentification minimale si nécessaire (clé API interne ou JWT).
- Loggez et rate-limit pour éviter abus.

5) Supabase — CORS & accès aux assets
- Si vous utilisez des URLs publiques Supabase Storage, vérifiez que la bucket est publique ou que vos images sont accessibles depuis l'URL fournie.
- Si vous utilisez signed URLs (recommandé pour sécurité), le proxy peut générer la signed URL côté serveur avant de faire l'appel à OpenAI.
- Dans le dashboard Supabase > Settings > API, autorisez les domaines Render si nécessaire (CORS).

6) Tests / post-déploiement
- Déployer la Static Site et vérifier la page principale.
- Si proxy utilisé: tester l'endpoint `/analyze` via curl/Postman avec `OPENAI_API_KEY` côté serveur.
- Tester upload + analyse (vérifier que OpenAI reçoit une URL accessible — utilisez `createSignedUrl` pour fiabilité).

Commandes utiles localement
- Build production localement:
```bash
npm ci
npm run build
# Preview build locally with a small static server:
npx serve dist
```
- Tester proxy local:
```bash
OPENAI_API_KEY=sk_xxx node server.js
curl -X POST http://localhost:3000/analyze -H 'Content-Type: application/json' -d '{"imageUrl":"https://...","promptType":"artist","lang":"fr"}'
```

Conseils et bonnes pratiques
- Déplacez toutes les requêtes OpenAI côté serveur pour protéger la clé.
- Ne mettez jamais `service_role` dans les variables `VITE_*` côté client.
- Utilisez signed URLs pour que OpenAI puisse télécharger les images sans problèmes de timeout.
- Configurez des health checks et alerts sur Render.

Si tu veux, je peux :
- Générer un `render.yaml` complet prêt à l'emploi avec tes URLs repo/branch.
- Ajouter le code `server.js` et un petit `package.json` dans le repo (PR) pour déployer le proxy.
- Te guider pas-à-pas pour connecter le repo à Render et ajouter les variables d'environnement.

---
