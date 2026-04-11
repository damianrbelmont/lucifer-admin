# Lucifer Admin

Editor JSON dinamico para Lucifer.

Ahora incluye persistencia opcional en Firebase:
- Colección por defecto: `lucifer_items`
- Documento de índice por defecto: `meta_lucifer/index`

Puedes sobreescribir la configuración antes de cargar `firebase.js`:
- `window.LUCIFER_ADMIN_FIREBASE_CONFIG`
- `window.LUCIFER_ITEMS_COLLECTION`
- `window.LUCIFER_INDEX_DOCUMENT`
- `window.LUCIFER_ADMIN_UID`
- `window.LUCIFER_ADMIN_EMAIL`

Fuente de verdad de plantillas:
- https://damianrbelmont.github.io/lore/lucifer/templates/json/

Tipos soportados:
- character
- location
- event
- concept
