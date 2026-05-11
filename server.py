import hashlib
import html
import json
import sqlite3
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "les_santes.db"
EVENTS_JSON = ROOT / "data" / "actes_santes_2025_pia.json"
HOST = "localhost"
PORT = 8000


def clean_html(value=""):
    text = str(value or "")
    for tag in ("<br>", "<br/>", "<br />", "</p>", "</div>", "</li>"):
        text = text.replace(tag, " ")
    inside = False
    out = []
    for char in text:
        if char == "<":
            inside = True
            continue
        if char == ">":
            inside = False
            continue
        if not inside:
            out.append(char)
    return html.unescape(" ".join("".join(out).split()))


def password_hash(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def get_image_url(event):
    url = (event.get("images") or {}).get("load_url") or ""
    return f"https:{url}" if url.startswith("//") else url


def get_category(event):
    ambits = " ".join(a.get("name", "") for a in event.get("ambits", []))
    text = f"{event.get('pretitle', '')} {ambits} {event.get('title', '')}".lower()
    if any(w in text for w in ("música", "concert", "dj", "catarres", "dissantes", "gospel")):
        return "Música"
    if any(w in text for w in ("familiar", "infantil", "canalla", "minisantes", "jocs")):
        return "Familiar"
    if any(w in text for w in ("tradicional", "castell", "gegant", "diable", "cultura popular", "ruixada", "proclama")):
        return "Tradicional"
    if any(w in text for w in ("exposició", "mostra", "museu", "visita guiada", "fotografia")):
        return "Cultura"
    if any(w in text for w in ("esport", "travessa", "nedant")):
        return "Esports"
    return "Altres"


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def create_schema(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          coins INTEGER NOT NULL DEFAULT 0,
          level INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rewards (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          cost INTEGER NOT NULL,
          image TEXT,
          type TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_rewards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          reward_id TEXT NOT NULL,
          equipped INTEGER NOT NULL DEFAULT 0,
          unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, reward_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS game_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          game_key TEXT NOT NULL,
          best_score INTEGER NOT NULL DEFAULT 0,
          coins_earned INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, game_key),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          pretitle TEXT,
          date_initial TEXT,
          date_detail TEXT,
          location TEXT,
          lat REAL,
          lng REAL,
          category TEXT,
          image TEXT,
          description_short TEXT,
          description TEXT,
          raw_json TEXT NOT NULL
        );
        """
    )


def seed_rewards(conn):
    rewards = [
        ("samarreta", "Samarreta Les Santes", "Peça digital exclusiva per al teu avatar.", 500, "👕", "Roba"),
        ("casc-galactic", "Casc Galàctic", "Accessoris brillants per jugar amb estil.", 1200, "🪐", "Accessoris"),
        ("pell-or", "Pell d'Or", "Recompensa llegendària de col·leccionista.", 2400, "🏆", "Especial"),
        ("botes", "Botes de velocitat", "Un impuls visual per als minijocs.", 1500, "👟", "Equipament"),
        ("pins", "Pack commemoratiu", "Pins digitals de Festa Major.", 300, "🏅", "Col·lecció"),
        ("confeti", "Confeti infinit", "Efecte festiu per celebrar victòries.", 800, "🎉", "Efectes"),
        ("motxilla", "Motxilla Premi", "Motxilla especial Minisantes.", 1800, "🎒", "Accessoris"),
        ("ticket", "Ticket sorpresa", "Premi misteriós per desbloquejar.", 650, "🎟️", "Especial"),
    ]
    conn.executemany(
        "INSERT OR IGNORE INTO rewards(id, name, description, cost, image, type) VALUES (?, ?, ?, ?, ?, ?)",
        rewards,
    )


def seed_user(conn):
    conn.execute(
        """
        INSERT OR IGNORE INTO users(username, password_hash, display_name, coins, level)
        VALUES (?, ?, ?, ?, ?)
        """,
        ("biel09", password_hash("santes2026"), "Biel_09", 9500, 4),
    )
    user_id = conn.execute("SELECT id FROM users WHERE username = ?", ("biel09",)).fetchone()["id"]
    conn.executemany(
        "INSERT OR IGNORE INTO user_rewards(user_id, reward_id, equipped) VALUES (?, ?, ?)",
        [(user_id, "pell-or", 1), (user_id, "pins", 0), (user_id, "confeti", 0)],
    )
    conn.executemany(
        """
        INSERT OR IGNORE INTO game_progress(user_id, game_key, best_score, coins_earned)
        VALUES (?, ?, ?, ?)
        """,
        [
            (user_id, "castell", 4200, 200),
            (user_id, "parelles", 3100, 100),
            (user_id, "confeti", 5100, 150),
        ],
    )


def import_events(conn):
    conn.execute("DELETE FROM events")
    data = json.loads(EVENTS_JSON.read_text(encoding="utf-8"))
    rows = []
    for index, event in enumerate(data.get("events", [])):
        point = event.get("location_point") if isinstance(event.get("location_point"), list) else []
        lat = point[0] if len(point) == 2 else None
        lng = point[1] if len(point) == 2 else None
        rows.append(
            (
                index,
                event.get("title") or "Sense títol",
                event.get("pretitle") or "",
                event.get("date_initial") or "",
                event.get("date_to_ca_detail") or "",
                event.get("location") or "",
                lat,
                lng,
                get_category(event),
                get_image_url(event),
                clean_html(event.get("description_short"))[:320],
                clean_html(event.get("description")),
                json.dumps(event, ensure_ascii=False),
            )
        )
    conn.executemany(
        """
        INSERT OR REPLACE INTO events(
          id, title, pretitle, date_initial, date_detail, location, lat, lng,
          category, image, description_short, description, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def init_db():
    with db() as conn:
        create_schema(conn)
        seed_rewards(conn)
        seed_user(conn)
        import_events(conn)


def row_to_dict(row):
    return dict(row) if row else None


def event_dict(row):
    item = row_to_dict(row)
    item["hasPoint"] = item["lat"] is not None and item["lng"] is not None
    item["location_point"] = [item["lat"], item["lng"]] if item["hasPoint"] else None
    return item


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return super().do_GET()

        try:
            with db() as conn:
                if parsed.path == "/api/events":
                    rows = conn.execute("SELECT * FROM events ORDER BY date_initial, id").fetchall()
                    return self.send_json({"events": [event_dict(r) for r in rows]})
                if parsed.path.startswith("/api/events/"):
                    event_id = int(parsed.path.rsplit("/", 1)[1])
                    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
                    if not row:
                        return self.send_json({"error": "Acte no trobat"}, HTTPStatus.NOT_FOUND)
                    return self.send_json({"event": event_dict(row)})
                if parsed.path == "/api/rewards":
                    rewards = [row_to_dict(r) for r in conn.execute("SELECT * FROM rewards ORDER BY cost").fetchall()]
                    return self.send_json({"rewards": rewards})
                if parsed.path == "/api/profile":
                    qs = parse_qs(parsed.query)
                    user_id = int(qs.get("user_id", [0])[0])
                    return self.send_json(profile_payload(conn, user_id))
        except Exception as exc:
            return self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        self.send_json({"error": "Ruta API no trobada"}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return self.send_json({"error": "Ruta API no trobada"}, HTTPStatus.NOT_FOUND)

        try:
            payload = self.read_json()
            with db() as conn:
                if parsed.path == "/api/login":
                    username = payload.get("username", "").strip()
                    password = payload.get("password", "")
                    row = conn.execute(
                        "SELECT * FROM users WHERE username = ? AND password_hash = ?",
                        (username, password_hash(password)),
                    ).fetchone()
                    if not row:
                        return self.send_json({"error": "Usuari o contrasenya incorrectes"}, HTTPStatus.UNAUTHORIZED)
                    return self.send_json(profile_payload(conn, row["id"]))

                if parsed.path == "/api/register":
                    username = payload.get("username", "").strip()
                    password = payload.get("password", "")
                    if len(username) < 3 or len(password) < 4:
                        return self.send_json({"error": "Usuari o contrasenya massa curts"}, HTTPStatus.BAD_REQUEST)
                    cur = conn.execute(
                        """
                        INSERT INTO users(username, password_hash, display_name, coins, level)
                        VALUES (?, ?, ?, 300, 1)
                        """,
                        (username, password_hash(password), username),
                    )
                    conn.execute(
                        "INSERT OR IGNORE INTO game_progress(user_id, game_key, best_score, coins_earned) VALUES (?, 'castell', 0, 0)",
                        (cur.lastrowid,),
                    )
                    return self.send_json(profile_payload(conn, cur.lastrowid), HTTPStatus.CREATED)

                if parsed.path == "/api/buy":
                    user_id = int(payload.get("user_id", 0))
                    reward_id = payload.get("reward_id", "")
                    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
                    reward = conn.execute("SELECT * FROM rewards WHERE id = ?", (reward_id,)).fetchone()
                    if not user or not reward:
                        return self.send_json({"error": "Usuari o recompensa no trobats"}, HTTPStatus.NOT_FOUND)
                    owned = conn.execute(
                        "SELECT id FROM user_rewards WHERE user_id = ? AND reward_id = ?",
                        (user_id, reward_id),
                    ).fetchone()
                    if owned:
                        return self.send_json({"error": "Ja tens aquesta recompensa"}, HTTPStatus.BAD_REQUEST)
                    if user["coins"] < reward["cost"]:
                        return self.send_json({"error": "No tens prou monedes"}, HTTPStatus.BAD_REQUEST)
                    conn.execute("UPDATE users SET coins = coins - ? WHERE id = ?", (reward["cost"], user_id))
                    conn.execute("INSERT INTO user_rewards(user_id, reward_id) VALUES (?, ?)", (user_id, reward_id))
                    return self.send_json(profile_payload(conn, user_id))
        except sqlite3.IntegrityError:
            return self.send_json({"error": "Aquest usuari ja existeix"}, HTTPStatus.CONFLICT)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        self.send_json({"error": "Ruta API no trobada"}, HTTPStatus.NOT_FOUND)


def profile_payload(conn, user_id):
    user = conn.execute(
        "SELECT id, username, display_name, coins, level, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not user:
        return {"error": "Usuari no trobat"}
    inventory = conn.execute(
        """
        SELECT ur.id AS user_reward_id, ur.equipped, ur.unlocked_at, r.*
        FROM user_rewards ur
        JOIN rewards r ON r.id = ur.reward_id
        WHERE ur.user_id = ?
        ORDER BY ur.unlocked_at DESC
        """,
        (user_id,),
    ).fetchall()
    progress = conn.execute(
        "SELECT game_key, best_score, coins_earned, updated_at FROM game_progress WHERE user_id = ? ORDER BY game_key",
        (user_id,),
    ).fetchall()
    return {
        "user": row_to_dict(user),
        "inventory": [row_to_dict(r) for r in inventory],
        "progress": [row_to_dict(r) for r in progress],
    }


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Les Santes disponible a http://{HOST}:{PORT}")
    print(f"Base de dades: {DB_PATH}")
    server.serve_forever()
