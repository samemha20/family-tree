const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const bcrypt = require("bcrypt");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const multer = require("multer");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: __dirname }),
  secret: "CHANGE_THIS_SECRET",
  resave: false,
  saveUninitialized: false
}));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

function isAuthed(req, res, next) {
  if (req.session?.admin) return next();
  return res.redirect("/admin/login");
}

/* ===== Ensure uploads folder exists ===== */
const uploadsDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

/* ===== Multer for uploads ===== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safe);
  }
});
const upload = multer({ storage });

/* ===== DB helpers ===== */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

function normalizeMulti(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

/* ===== spouse names helpers ===== */
async function getSpouseNames(personId) {
  return all(
    `SELECT spouse_name, ord
     FROM person_spouses
     WHERE person_id = ?
     ORDER BY ord ASC, id ASC`,
    [personId]
  );
}

async function setSpouseNames(personId, names) {
  await run(`DELETE FROM person_spouses WHERE person_id = ?`, [personId]);

  const cleaned = normalizeMulti(names)
    .map(s => String(s || "").trim())
    .filter(Boolean);

  let ord = 1;
  for (const nm of cleaned) {
    await run(
      `INSERT INTO person_spouses (person_id, spouse_name, ord)
       VALUES (?, ?, ?)`,
      [personId, nm, ord]
    );
    ord++;
  }
}

/* ===== Tree builder ===== */
function buildTree(rows) {
  const byId = new Map(rows.map(r => [r.id, { ...r, children: [] }]));
  let root = null;

  for (const r of byId.values()) {
    if (r.father_id) {
      const parent = byId.get(r.father_id);
      if (parent) parent.children.push(r);
    } else {
      if (!root) root = r;
    }
  }
  return root;
}

/* =========================
   CMS TABLES (auto create + seed)
   ========================= */
async function ensureCmsTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS site_pages (
      slug TEXT PRIMARY KEY,
      title TEXT,
      subtitle TEXT,
      content TEXT,
      updated_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS honor_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      field TEXT,
      achievement TEXT,
      photo_url TEXT,
      ord INTEGER DEFAULT 1
    )
  `);

  // optional: store support messages
  await run(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_name TEXT,
      phone TEXT,
      message TEXT,
      created_at TEXT
    )
  `);

  // seed pages if missing
  const seeds = [
    { slug: "about", title: "نبذة عن العائلة", subtitle: "لمحة تاريخية مختصرة عن الجذور والمسار", content: "" },
    { slug: "support", title: "الدعم والشكاوى", subtitle: "أرسل اقتراحك أو بلاغك وسيتم مراجعته", content: "" },
    { slug: "tree-pdf", title: "شجرة العائلة PDF", subtitle: "عرض التصميم الرسمي داخل برواز مزخرف", content: "" }
  ];

  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const exists = await get(`SELECT slug FROM site_pages WHERE slug = ?`, [s.slug]);
    if (!exists) {
      await run(
        `INSERT INTO site_pages (slug, title, subtitle, content, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [s.slug, s.title, s.subtitle, s.content]
      );
    }
  }
}

// run once at startup
ensureCmsTables().catch(err => console.error("CMS init error:", err));

/* =========================
   Public Pages
   ========================= */

// Home (tree)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// CMS pages (EJS)
app.get("/about", async (req, res) => {
  const page = await get(`SELECT * FROM site_pages WHERE slug = 'about'`);
  res.render("public_page", { slug: "about", page });
});

app.get("/support", async (req, res) => {
  const page = await get(`SELECT * FROM site_pages WHERE slug = 'support'`);
  res.render("public_support", { slug: "support", page, sent: req.query.sent === "1" });
});

app.post("/support/send", async (req, res) => {
  const { sender_name, phone, message } = req.body;
  await run(
    `INSERT INTO support_messages (sender_name, phone, message, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [String(sender_name || "").trim(), String(phone || "").trim(), String(message || "").trim()]
  );
  res.redirect("/support?sent=1");
});

app.get("/tree-pdf", async (req, res) => {
  const page = await get(`SELECT * FROM site_pages WHERE slug = 'tree-pdf'`);
  res.render("public_treepdf", { slug: "tree-pdf", page });
});

app.get("/honor", async (req, res) => {
  const items = await all(`SELECT * FROM honor_items ORDER BY ord ASC, id ASC`);
  res.render("public_honor", { slug: "honor", items });
});

// keep old urls working
app.get("/pages/about.html", (req, res) => res.redirect(301, "/about"));
app.get("/pages/support.html", (req, res) => res.redirect(301, "/support"));
app.get("/pages/tree-pdf.html", (req, res) => res.redirect(301, "/tree-pdf"));
app.get("/pages/honor.html", (req, res) => res.redirect(301, "/honor"));

/* ===== API ===== */
app.get("/api/tree", async (req, res) => {
  const rows = await all("SELECT * FROM persons ORDER BY id ASC");
  const root = buildTree(rows);
  res.json(root || null);
});

app.get("/api/person/:id", async (req, res) => {
  const row = await get("SELECT * FROM persons WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });

  const children = await all(
    "SELECT id, name FROM persons WHERE father_id = ? ORDER BY id ASC",
    [row.id]
  );

  const spouses = await getSpouseNames(row.id);
  res.json({ ...row, children, spouses });
});

/* ===== Admin auth ===== */
app.get("/admin/login", (req, res) => res.render("login", { error: null }));

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const admin = await get("SELECT * FROM admins WHERE username = ?", [username]);
  if (!admin) return res.render("login", { error: "بيانات الدخول غير صحيحة" });

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.render("login", { error: "بيانات الدخول غير صحيحة" });

  req.session.admin = { id: admin.id, username: admin.username };
  res.redirect("/admin");
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ===== Upload endpoint ===== */
app.post("/admin/upload", isAuthed, upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded");
  res.json({ url: "/uploads/" + req.file.filename });
});

/* ===== Admin: persons CRUD ===== */
app.get("/admin", isAuthed, async (req, res) => {
  const persons = await all(`
    SELECT p.*, f.name as father_name,
      (
        SELECT group_concat(spouse_name, ' | ')
        FROM person_spouses
        WHERE person_id = p.id
        ORDER BY ord ASC, id ASC
      ) as spouses_text
    FROM persons p
    LEFT JOIN persons f ON p.father_id = f.id
    ORDER BY p.id ASC
  `);
  res.render("admin", { persons, admin: req.session.admin });
});

app.get("/admin/person/new", isAuthed, async (req, res) => {
  const persons = await all("SELECT id, name FROM persons ORDER BY name ASC");
  res.render("person_form", {
    mode: "new",
    persons,
    person: null,
    spouseNames: [],
    admin: req.session.admin
  });
});

app.post("/admin/person/new", isAuthed, async (req, res) => {
  const { name, father_id, birth_date, job, photo_url, notes } = req.body;
  const spouse_names = req.body.spouse_names;

  const result = await run(
    `INSERT INTO persons (name, father_id, birth_date, job, lineage, photo_url, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, father_id || null, birth_date || null, job || null, null, photo_url || null, notes || null]
  );

  await setSpouseNames(result.lastID, spouse_names);
  res.redirect("/admin");
});

app.get("/admin/person/:id/edit", isAuthed, async (req, res) => {
  const person = await get("SELECT * FROM persons WHERE id = ?", [req.params.id]);
  const persons = await all("SELECT id, name FROM persons WHERE id != ? ORDER BY name ASC", [req.params.id]);
  if (!person) return res.redirect("/admin");

  const spouseRows = await getSpouseNames(person.id);
  const spouseNames = spouseRows.map(x => x.spouse_name);

  res.render("person_form", { mode: "edit", persons, person, spouseNames, admin: req.session.admin });
});

app.post("/admin/person/:id/edit", isAuthed, async (req, res) => {
  const { name, father_id, birth_date, job, photo_url, notes } = req.body;
  const spouse_names = req.body.spouse_names;

  await run(
    `UPDATE persons
     SET name=?, father_id=?, birth_date=?, job=?, photo_url=?, notes=?
     WHERE id=?`,
    [name, father_id || null, birth_date || null, job || null, photo_url || null, notes || null, req.params.id]
  );

  await setSpouseNames(req.params.id, spouse_names);
  res.redirect("/admin");
});

app.post("/admin/person/:id/delete", isAuthed, async (req, res) => {
  const id = req.params.id;

  const child = await get("SELECT id FROM persons WHERE father_id = ? LIMIT 1", [id]);
  if (child) return res.status(400).send("لا يمكن حذف شخص لديه أبناء. احذف/انقل الأبناء أولاً.");

  await run("DELETE FROM person_spouses WHERE person_id = ?", [id]);
  await run("DELETE FROM persons WHERE id = ?", [id]);

  res.redirect("/admin");
});
/* =========================
   Admin: CMS (Pages + Honor)
   ========================= */

// Pages editor
app.get("/admin/pages", isAuthed, async (req, res) => {
  const about = await get(`SELECT * FROM site_pages WHERE slug='about'`);
  const support = await get(`SELECT * FROM site_pages WHERE slug='support'`);
  const treepdf = await get(`SELECT * FROM site_pages WHERE slug='tree-pdf'`);
  res.render("pages_admin", { admin: req.session.admin, about, support, treepdf, saved: req.query.saved === "1" });
});

app.post("/admin/pages/save", isAuthed, async (req, res) => {
  const { slug, title, subtitle, content } = req.body;
  await run(
    `UPDATE site_pages
     SET title=?, subtitle=?, content=?, updated_at=datetime('now')
     WHERE slug=?`,
    [title || "", subtitle || "", content || "", slug]
  );
  res.redirect("/admin/pages?saved=1");
});

// Honor CRUD
app.get("/admin/honor", isAuthed, async (req, res) => {
  const items = await all(`SELECT * FROM honor_items ORDER BY ord ASC, id ASC`);
  res.render("honor_admin", { admin: req.session.admin, items });
});

app.get("/admin/honor/new", isAuthed, async (req, res) => {
  res.render("honor_form", { admin: req.session.admin, mode: "new", item: null });
});

app.post("/admin/honor/new", isAuthed, async (req, res) => {
  const { name, field, achievement, photo_url, ord } = req.body;
  await run(
    `INSERT INTO honor_items (name, field, achievement, photo_url, ord)
     VALUES (?, ?, ?, ?, ?)`,
    [name || "", field || "", achievement || "", photo_url || "", Number(ord || 1)]
  );
  res.redirect("/admin/honor");
});

app.get("/admin/honor/:id/edit", isAuthed, async (req, res) => {
  const item = await get(`SELECT * FROM honor_items WHERE id=?`, [req.params.id]);
  if (!item) return res.redirect("/admin/honor");
  res.render("honor_form", { admin: req.session.admin, mode: "edit", item });
});

app.post("/admin/honor/:id/edit", isAuthed, async (req, res) => {
  const { name, field, achievement, photo_url, ord } = req.body;
  await run(
    `UPDATE honor_items
     SET name=?, field=?, achievement=?, photo_url=?, ord=?
     WHERE id=?`,
    [name || "", field || "", achievement || "", photo_url || "", Number(ord || 1), req.params.id]
  );
  res.redirect("/admin/honor");
});

app.post("/admin/honor/:id/delete", isAuthed, async (req, res) => {
  await run(`DELETE FROM honor_items WHERE id=?`, [req.params.id]);
  res.redirect("/admin/honor");
});

/* =========================
   Admin: Support Messages
   ========================= */

// List messages
app.get("/admin/support-messages", isAuthed, async (req, res) => {
  const msgs = await all(`
    SELECT *
    FROM support_messages
    ORDER BY id DESC
  `);
  res.render("support_messages", {
    admin: req.session.admin,
    msgs,
    deleted: req.query.deleted === "1"
  });
});

// Delete message
app.post("/admin/support-messages/:id/delete", isAuthed, async (req, res) => {
  await run(`DELETE FROM support_messages WHERE id=?`, [req.params.id]);
  res.redirect("/admin/support-messages?deleted=1");
});

// Export CSV
app.get("/admin/support-messages/export.csv", isAuthed, async (req, res) => {
  const msgs = await all(`
    SELECT id, sender_name, phone, message, created_at
    FROM support_messages
    ORDER BY id DESC
  `);

  const escapeCsv = (v) => {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  };

  const header = ["id", "sender_name", "phone", "message", "created_at"].join(",");
  const lines = msgs.map(m => [
    m.id,
    escapeCsv(m.sender_name),
    escapeCsv(m.phone),
    escapeCsv(m.message),
    escapeCsv(m.created_at)
  ].join(","));

  const csv = [header, ...lines].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="support_messages.csv"');
  res.send("\uFEFF" + csv);
});
/* =========================
   Public Pages (DB Driven)
   ========================= */

// Home (tree) - سيبها زي ما هي لو انت بتعرض public/index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ABOUT (from site_pages)
app.get("/about", async (req, res) => {
  try {
    const page = await get(`SELECT * FROM site_pages WHERE slug='about'`);
    if (!page) return res.status(404).send("صفحة النبذة غير موجودة");
    res.render("about", { page });
  } catch (e) {
    console.error(e);
    res.status(500).send("خطأ في تحميل صفحة النبذة");
  }
});

// HONOR (from honor_items)
app.get("/honor", async (req, res) => {
  try {
    const items = await all(`SELECT * FROM honor_items ORDER BY ord ASC, id ASC`);
    res.render("honor", { items });
  } catch (e) {
    console.error(e);
    res.status(500).send("خطأ في تحميل صفحة قائمة الشرف");
  }
});

// TREE PDF (from site_pages)
app.get("/tree-pdf", async (req, res) => {
  try {
    const page = await get(`SELECT * FROM site_pages WHERE slug='tree-pdf'`);
    if (!page) return res.status(404).send("صفحة شجرة PDF غير موجودة");
    res.render("tree_pdf", { page });
  } catch (e) {
    console.error(e);
    res.status(500).send("خطأ في تحميل صفحة PDF");
  }
});

// SUPPORT (from site_pages) + show sent flag
app.get("/support", async (req, res) => {
  try {
    const page = await get(`SELECT * FROM site_pages WHERE slug='support'`);
    if (!page) return res.status(404).send("صفحة الدعم غير موجودة");
    res.render("support", { page, sent: req.query.sent === "1" });
  } catch (e) {
    console.error(e);
    res.status(500).send("خطأ في تحميل صفحة الدعم");
  }
});

// SUPPORT form submit -> save to support_messages
app.post("/support", async (req, res) => {
  try {
    const { sender_name, phone, topic, message } = req.body;

    if (!sender_name || !message) {
      return res.redirect("/support");
    }

    await run(
      `INSERT INTO support_messages (sender_name, phone, topic, message, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [
        String(sender_name || "").trim(),
        String(phone || "").trim(),
        String(topic || "").trim(),
        String(message || "").trim()
      ]
    );

    return res.redirect("/support?sent=1");
  } catch (e) {
    console.error(e);
    res.status(500).send("خطأ أثناء إرسال الرسالة");
  }
});

// Redirect old URLs (اختياري علشان لو حد فاتح بالقديم)
app.get("/pages/about.html", (req, res) => res.redirect(301, "/about"));
app.get("/pages/honor.html", (req, res) => res.redirect(301, "/honor"));
app.get("/pages/support.html", (req, res) => res.redirect(301, "/support"));
app.get("/pages/tree-pdf.html", (req, res) => res.redirect(301, "/tree-pdf"));
// =========================
// Public Page: About
// =========================
app.get("/about", async (req, res) => {
  try {
    const page = await get(
      "SELECT * FROM site_pages WHERE slug = 'about'"
    );

    if (!page) {
      return res.status(404).send("صفحة النبذة غير موجودة");
    }

    res.render("about", {
      page
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("خطأ في تحميل صفحة النبذة");
  }
});
/* ===== 404 ===== */
app.use((req, res) => {
  res.status(404).send("الصفحة غير موجودة");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on http://localhost:" + PORT));

