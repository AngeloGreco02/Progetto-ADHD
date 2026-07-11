# Progetto ADHD Quest

Una prima versione locale del gioco per trasformare pensieri, attività, scadenze e impegni in quest giornaliere.

## Aprire l'app

Apri `index.html` nel browser.

## Coach AI vero

Per usare il coach come vera intelligenza artificiale, avvia l'app con il server locale:

```bash
OPENAI_API_KEY="la-tua-chiave" python3 server.py
```

Poi apri `http://127.0.0.1:8123/index.html`.

La chiave resta sul server locale e non finisce dentro la pagina. Se la chiave non è configurata, il coach usa una guida locale di emergenza.

## Firebase

L'app è pronta per sincronizzare il salvataggio su Firebase.

1. Crea un progetto su Firebase.
2. Aggiungi una Web App.
3. Copia la configurazione Firebase dentro `firebase-config.js`.
4. In Firebase Authentication abilita "Anonymous".
5. Crea Firestore Database.
6. Usa queste regole Firestore:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/game/state {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Quando Firebase è configurato, il badge in alto passa da `Locale` a `Cloud`.

Per pubblicarla su Firebase Hosting e usare il coach AI da Cloud Functions:

```bash
firebase login
firebase use --add
cd functions
npm install
cd ..
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy
```

`firebase-config.js` serve al browser. Il secret `OPENAI_API_KEY` resta invece su Firebase Functions e non va mai messo nella pagina.

## Cosa c'è già

- profilo con XP, livelli, crediti e streak
- immagine profilo personalizzabile
- nuova partita pulita, senza dati precompilati
- sincronizzazione Firebase opzionale per profilo, quest e progressi
- configurazione Firebase Hosting + Functions per portare online app e coach AI
- forgia quest con rune rapide e dettagli opzionali
- prossima azione con spiegazione del perché viene prima
- guida coach per ogni quest o evento, collegabile a OpenAI
- recupero guidato quando segni una missione come non fatta
- mappa del giorno e parcheggio
- timer focus da 10, 25 o 45 minuti
- import calendario da file `.ics`, filtrando gli eventi vecchi
- backup JSON in entrata e in uscita
- script per dire no e ricevere XP quando proteggi la capienza

Senza Firebase i dati restano nel browser tramite `localStorage`.
