# Arquitectura del projecte Les Santes

## Estructura principal

- `server.py` — servidor Python, inicialització SQLite i rutes API.
- `database.sql` — esquema de base de dades documentat.
- `data/actes_santes_2025_pia.json` — font oficial d'actes importada a la BBDD.
- `index.html` — shell principal de l'aplicació.
- `css/styles.css` — design system, components i responsive.
- `js/app.js` — estat de client, renderitzat de vistes i interaccions.
- `img/` — recursos visuals locals.

## Capes lògiques

1. **Dades**: SQLite guarda usuaris, actes, recompenses, inventari i progrés.
2. **API**: `server.py` exposa `/api/events`, `/api/profile`, `/api/buy`, `/api/equip` i `/api/progress`.
3. **UI**: `js/app.js` renderitza les pantalles segons la ruta hash.
4. **Estètica**: `css/styles.css` manté tokens visuals i components reutilitzables.

## Perfil i personatge equipat

El perfil utilitza la informació de `user_rewards.equipped` per construir un personatge visual.
Cada tipus de recompensa ocupa una zona del personatge:

- `Roba` → cos
- `Equipament` → part inferior/equipament
- `Accessoris` → element lateral superior
- `Efectes` → element flotant
- `Especial` → element especial
- `Col·lecció` → insígnia/col·lecció

Aquesta visualització és purament de frontend, però depèn de dades reals de BBDD.
