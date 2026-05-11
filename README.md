# Les Santes 2026 · Minisantes

Web final presentable per a classe: programa públic, mapa d’actes de Mataró i zona Minisantes amb login o mode convidat.

## Com executar

Cal executar el servidor perquè inicialitzi SQLite i exposi l’API:

```bash
python3 server.py
```

Després obre:

```txt
http://localhost:8000
```

No obris `index.html` directament, perquè el frontend necessita `/api` i el mapa carrega Leaflet/OpenStreetMap.

## Usuari de prova

- Usuari: `biel09`
- Contrasenya: `santes2026`

També es pot entrar a Minisantes com a convidat. En aquest mode es veuen els minijocs, però el progrés no es guarda i no es pot accedir a Perfil, Botiga ni Inventari.

## Rutes principals

- `#home`: portada pública
- `#programa`: llistat públic d’actes amb filtres i cerca
- `#mapa`: mapa Leaflet amb pins reals segons `location_point`
- `#acte/{id}`: detall públic d’un acte
- `#minisantes`: accés Minisantes, mode convidat i minijocs visuals
- `#login`: login o registre
- `#perfil`: dades d’usuari registrat
- `#botiga`: recompenses de la base de dades
- `#inventari`: recompenses desbloquejades

## Base de dades

`server.py` crea `les_santes.db` automàticament amb:

- `users`: compte, monedes, nivell i data de creació
- `rewards`: premis disponibles a la botiga
- `user_rewards`: inventari de cada usuari
- `game_progress`: progrés dels minijocs
- `events`: actes importats del JSON oficial 2025

El fitxer `database.sql` documenta el mateix esquema.

## API

- `GET /api/events`
- `GET /api/events/{id}`
- `GET /api/rewards`
- `GET /api/profile?user_id=1`
- `POST /api/login`
- `POST /api/register`
- `POST /api/buy`

## Dependències

No cal instal·lar paquets Python externs. S’utilitza:

- Python 3 amb `sqlite3` i `http.server`
- Leaflet 1.9.4 via CDN
- OpenStreetMap per a les tessel·les del mapa
- Google Fonts via CDN

## Estructura

```txt
server.py
index.html
css/styles.css
js/app.js
database.sql
data/actes_santes_2025_pia.json
data/users.example.json
```
