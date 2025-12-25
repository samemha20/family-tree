// db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "family.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      father_id INTEGER NULL,
      birth_date TEXT NULL,
      job TEXT NULL,
      lineage TEXT NULL,
      photo_url TEXT NULL,
      notes TEXT NULL,
      FOREIGN KEY (father_id) REFERENCES persons(id)
    )
  `);
});

module.exports = db;
