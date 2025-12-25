// seed.js
const db = require("./db");
const bcrypt = require("bcrypt");

function run(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

(async () => {
  // 1) Admin
  const username = "admin";
  const password = "admin123"; // غيّره بعد ما تشتغل
  const hash = await bcrypt.hash(password, 10);

  try {
    await run("INSERT INTO admins (username, password_hash) VALUES (?, ?)", [username, hash]);
  } catch (e) {
    // ignore if exists
  }

  // 2) Insert persons (إذا فاضي)
  const any = await get("SELECT id FROM persons LIMIT 1");
  if (any) {
    console.log("DB already seeded.");
    process.exit(0);
  }

  // Helper insert and return id
  async function addPerson({name, father_id=null, birth_date=null, job=null, lineage=null, photo_url=null, notes=null}) {
    const r = await run(
      `INSERT INTO persons (name, father_id, birth_date, job, lineage, photo_url, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, father_id, birth_date, job, lineage, photo_url, notes]
    );
    return r.lastID;
  }

  // جد → ابن → ابن
  const hassan1 = await addPerson({ name: "حسن", lineage: "من الحقيل" });
  const yusuf   = await addPerson({ name: "يوسف", father_id: hassan1, lineage: "من الحقيل" });
  const hajaj   = await addPerson({ name: "حجاج", father_id: yusuf, lineage: "من الحقيل" });

  // أبناء حجاج: حازم، حسن، حسام
  const hazemA  = await addPerson({ name: "حازم", father_id: hajaj, lineage: "من الحقيل", job:"", birth_date:"" });
  const hassan2 = await addPerson({ name: "حسن", father_id: hajaj, lineage: "من الحقيل" });
  const hussam  = await addPerson({ name: "حسام", father_id: hajaj, lineage: "من الحقيل" });

  // أبناء حازم: صقر، رحيم، يزن
  await addPerson({ name: "صقر", father_id: hazemA, lineage: "من الحقيل" });
  await addPerson({ name: "رحيم", father_id: hazemA, lineage: "من الحقيل" });
  await addPerson({ name: "يزن", father_id: hazemA, lineage: "من الحقيل" });

  // أبناء حسن: حجاج، احمد
  await addPerson({ name: "حجاج", father_id: hassan2, lineage: "من الحقيل" });
  await addPerson({ name: "أحمد", father_id: hassan2, lineage: "من الحقيل" });

  // أبناء حسام: حازم، عمار، ركان
  await addPerson({ name: "حازم", father_id: hussam, lineage: "من الحقيل" });
  await addPerson({ name: "عمار", father_id: hussam, lineage: "من الحقيل" });
  await addPerson({ name: "ركان", father_id: hussam, lineage: "من الحقيل" });

  console.log("Seed complete. Admin: admin / admin123");
  process.exit(0);
})();
