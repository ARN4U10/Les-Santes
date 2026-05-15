# Les Santes 2026 · Minisantes

Web final presentable per a classe: programa públic, secció d’actes destacats a la portada, mapa d’actes de Mataró i zona Minisantes amb login o mode convidat.

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
- `#home/avui`: baixa a la secció d’actes d’avui o destacats propers de la Home
- `#programa`: llistat públic d’actes amb filtres i cerca
- `#mapa`: mapa Leaflet amb pins reals segons `location_point`
- `#acte/{id}`: detall públic d’un acte
- `#minisantes`: accés Minisantes, mode convidat i jocs destacats
- `#jocs`: catàleg amb tots els jocs de MiniSantes
- `#castell`: minijoc funcional Construeix el Castell
- `#memory`: minijoc Troba les parelles
- `#gegants`: minijoc funcional Fes Ballar els Gegants
- `#correfoc`: minijoc funcional Correfoc Segur
- `#campanes`: minijoc funcional Toc de Campanes
- `#login`: login o registre
- `#perfil`: perfil premium amb nivell, monedes, progrés i personatge equipat
- `#botiga`: recompenses pendents de comprar, amb compra bloquejada en mode convidat
- `#inventari`: recompenses desbloquejades i personalització del personatge

## Base de dades

`server.py` crea `les_santes.db` automàticament amb:

- `users`: compte, monedes, nivell i data de creació
- `rewards`: premis disponibles a la botiga
- `user_rewards`: inventari de cada usuari i estat `equipped`
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
- `POST /api/equip`
- `POST /api/progress`

## Canvis recents

- El botó `Què passa avui?` porta a `#home/avui`, la secció de la Home que hi ha just sota el hero amb actes del dia o destacats propers.
- El botó `Com arribar` del detall obre Google Maps amb ruta a les coordenades de l’acte; si no hi ha permisos de geolocalització, obre igual el destí.
- `Construeix el Castell` és jugable amb 3 vides, puntuació, monedes finals i guardat de progrés per a usuaris registrats.
- El catàleg de jocs integra `Fes Ballar els Gegants`, `Correfoc Segur` i `Toc de Campanes` com a minijocs funcionals.
- La botiga serveix per comprar recompenses noves; l’inventari serveix per aplicar-les al personatge, amb un sol objecte equipat per tipus.
- El perfil mostra avatar/personatge, nivell, monedes, progrés, recompenses aplicades i últims jocs jugats; en mode convidat queda bloquejat amb missatge clar.

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


## Organització professional del codi

S’ha afegit documentació a `docs/ARCHITECTURE.md` amb l’estructura del projecte i el funcionament de la BBDD.

La pantalla de perfil ara mostra un personatge MiniSantes que es vesteix dinàmicament segons les recompenses equipades a l’inventari. La lògica de compra/equipament continua depenent de SQLite i de les rutes `/api/buy` i `/api/equip`.
