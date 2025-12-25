async function fetchTree() {
  const r = await fetch("/api/tree");
  return r.json();
}
async function fetchPerson(id) {
  const r = await fetch(`/api/person/${id}`);
  return r.json();
}

/* ===== Theme (Light/Dark) ===== */
(function themeInit(){
  const btn = document.getElementById("themeToggle");
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  if (btn) btn.textContent = saved === "light" ? "الوضع: فاتح" : "الوضع: داكن";

  btn?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    btn.textContent = next === "light" ? "الوضع: فاتح" : "الوضع: داكن";
  });
})();

/* ===== Modal ===== */
function openModal(html) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  body.innerHTML = html;
  modal.classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}
document.getElementById("closeModal")?.addEventListener("click", closeModal);
document.getElementById("modal")?.addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

/* ===== Drawer (Overlay) ===== */
const drawer = document.getElementById("drawer");

function openDrawer(){
  drawer?.classList.add("isOpen");
}
function closeDrawer(){
  drawer?.classList.remove("isOpen");
}

document.getElementById("toggleDetails")?.addEventListener("click", () => {
  drawer?.classList.toggle("isOpen");
});
document.getElementById("closeDrawer")?.addEventListener("click", closeDrawer);

/* ===== Details ===== */
function showDetailsInSide(person) {
  const details = document.getElementById("details");
  const childrenCount = person.children ? person.children.length : 0;

  const spousesText = (person.spouses && person.spouses.length)
    ? person.spouses
        .map(s => `${s.ord ? s.ord + ") " : ""}${s.spouse_name}`)
        .join("<br>")
    : "-";

  details.innerHTML = `
    <div class="kvs">
      <div><b>الاسم:</b> ${person.name}</div>
      <div><b>تاريخ الميلاد:</b> ${person.birth_date || "-"}</div>
      <div><b>العمل:</b> ${person.job || "-"}</div>
      <div><b>الزوج/الزوجة:</b><div style="margin-top:6px; line-height:1.8">${spousesText}</div></div>
      <div><b>عدد الأبناء:</b> ${childrenCount}</div>
      ${person.notes ? `<div><b>ملاحظات:</b> ${person.notes}</div>` : ""}
    </div>
  `;
}

/* ===== Frame (SVG) ===== */
function starPath(cx, cy, outerR, innerR, points) {
  let path = "";
  const step = Math.PI / points;
  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = i * step - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    path += (i === 0 ? "M" : "L") + x + " " + y + " ";
  }
  return path + "Z";
}

function addFrame(g, w, h) {
  g.append("rect")
    .attr("x", -w/2).attr("y", -h/2)
    .attr("width", w).attr("height", h)
    .attr("rx", 18).attr("ry", 18)
    .attr("fill", "var(--cardFill)")
    .attr("stroke", "#c7a24b")
    .attr("stroke-width", 2.6);

  g.append("rect")
    .attr("x", -w/2 + 9).attr("y", -h/2 + 9)
    .attr("width", w - 18).attr("height", h - 18)
    .attr("rx", 16).attr("ry", 16)
    .attr("fill", "var(--cardInner)")
    .attr("stroke", "#e5e7eb")
    .attr("stroke-width", 1.2);

  const corners = [
    {x: -w/2 + 20, y: -h/2 + 20},
    {x:  w/2 - 20, y: -h/2 + 20},
    {x: -w/2 + 20, y:  h/2 - 20},
    {x:  w/2 - 20, y:  h/2 - 20},
  ];
  corners.forEach(c => {
    g.append("circle")
      .attr("cx", c.x).attr("cy", c.y).attr("r", 8)
      .attr("fill", "none")
      .attr("stroke", "#c7a24b")
      .attr("stroke-width", 1.8);

    g.append("path")
      .attr("d", starPath(c.x, c.y, 7, 3.4, 8))
      .attr("fill", "#c7a24b")
      .attr("opacity", 0.55);
  });

  g.append("path")
    .attr("d", `M ${-w/2 + 26} ${22} Q 0 ${10} ${w/2 - 26} ${22}`)
    .attr("stroke", "#e3c46a")
    .attr("stroke-width", 2)
    .attr("fill", "none")
    .attr("opacity", 0.7);
}

/* ===== Focus Mode ===== */
function getAncestors(node) {
  const arr = [];
  let p = node.parent;
  while (p) { arr.push(p); p = p.parent; }
  return arr;
}
function getChildren(node) {
  return node.children || [];
}
function focusOnNode(clickedNode, allNodesSel, allLinksSel) {
  const visible = new Set([clickedNode, ...getAncestors(clickedNode), ...getChildren(clickedNode)]);

  allNodesSel
    .attr("opacity", d => visible.has(d) ? 1 : 0.07)
    .attr("pointer-events", d => visible.has(d) ? "auto" : "none");

  allLinksSel
    .attr("opacity", d => (visible.has(d.source) && visible.has(d.target)) ? 1 : 0.04);

  return visible;
}
function resetFocus(allNodesSel, allLinksSel) {
  allNodesSel.attr("opacity", 1).attr("pointer-events", "auto");
  allLinksSel.attr("opacity", 1);
  allNodesSel.classed("nodeSelected", false);
}

/* ===== Pan/Zoom + Fit ===== */
let svg, mainG, zoomBehavior;

function fitToScreen(containerEl, padding = 90) {
  const bounds = mainG.node().getBBox();
  const w = containerEl.clientWidth || 1;
  const h = containerEl.clientHeight || 1;

  const fullW = bounds.width + padding * 2;
  const fullH = bounds.height + padding * 2;

  const scale = Math.min(w / fullW, h / fullH);
  const tx = (w - bounds.width * scale) / 2 - bounds.x * scale;
  const ty = (h - bounds.height * scale) / 2 - bounds.y * scale;

  const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
  svg.transition().duration(320).call(zoomBehavior.transform, t);
}

/* ===== Render ===== */
function renderTree(rootData) {
  const container = document.getElementById("tree");
  container.innerHTML = "";

  const width = container.clientWidth || 1;
  const height = container.clientHeight || 1;

  svg = d3.select(container).append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  mainG = svg.append("g").attr("class", "mainG");

  zoomBehavior = d3.zoom()
    .scaleExtent([0.35, 2.2])
    .on("zoom", (event) => mainG.attr("transform", event.transform));

  svg.call(zoomBehavior);

  const root = d3.hierarchy(rootData);

  const treeLayout = d3.tree()
    .nodeSize([260, 210])
    .separation((a, b) => (a.parent === b.parent ? 1.3 : 1.6));

  treeLayout(root);

  const links = mainG.append("g")
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr("class", "link")
    .attr("d", d3.linkVertical().x(d => d.x).y(d => d.y));

  const cardW = 220, cardH = 168;
  const photoW = 78, photoH = 78;
  const photoX = -photoW/2;
  const photoY = -cardH/2 + 16;

  const nodes = mainG.append("g")
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("class", "nodeCard")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  nodes.each(function () { addFrame(d3.select(this), cardW, cardH); });

  nodes.append("rect")
    .attr("x", photoX - 10).attr("y", photoY - 10)
    .attr("width", photoW + 20).attr("height", photoH + 20)
    .attr("rx", 18).attr("ry", 18)
    .attr("fill", "var(--cardFill)")
    .attr("stroke", "#c7a24b")
    .attr("stroke-width", 2.4);

  nodes.append("rect")
    .attr("x", photoX - 5).attr("y", photoY - 5)
    .attr("width", photoW + 10).attr("height", photoH + 10)
    .attr("rx", 16).attr("ry", 16)
    .attr("fill", "#f3f4f6")
    .attr("stroke", "#e5e7eb")
    .attr("stroke-width", 1.2);

  nodes.each(function (d) {
    const g = d3.select(this);
    const clipId = `clip-${d.data.id}`;

    g.append("clipPath")
      .attr("id", clipId)
      .append("rect")
      .attr("x", photoX).attr("y", photoY)
      .attr("width", photoW).attr("height", photoH)
      .attr("rx", 14).attr("ry", 14);

    const photo = d.data.photo_url || "/images/default.png";

    g.append("image")
      .attr("href", photo)
      .attr("x", photoX)
      .attr("y", photoY)
      .attr("width", photoW)
      .attr("height", photoH)
      .attr("clip-path", `url(#${clipId})`)
      .attr("preserveAspectRatio", "xMidYMid slice");
  });

  nodes.append("text")
    .attr("class", "nodeName")
    .attr("text-anchor", "middle")
    .attr("x", 0)
    .attr("y", 62)
    .text(d => d.data.name);

  nodes.on("click", async (event, d) => {
    event.stopPropagation();

    const p = await fetchPerson(d.data.id);
    showDetailsInSide(p);

    // ✅ افتح الدروار كـ overlay (بدون ما يأثر على مساحة الشجرة)
    openDrawer();

    resetFocus(nodes, links);
    nodes.classed("nodeSelected", n => n === d);
    focusOnNode(d, nodes, links);

    const spousesHtml = (p.spouses && p.spouses.length)
      ? p.spouses.map(s => `<div>${s.ord}) ${s.spouse_name}</div>`).join("")
      : "-";

    openModal(`
      <h3 style="margin:0 0 10px 0">${p.name}</h3>
      <p><b>تاريخ الميلاد:</b> ${p.birth_date || "-"}</p>
      <p><b>العمل:</b> ${p.job || "-"}</p>
      <p><b>الزوج/الزوجة:</b><div style="margin-top:6px;line-height:1.8">${spousesHtml}</div></p>
      <p><b>الأبناء:</b> ${(p.children || []).map(c => c.name).join("، ") || "-"}</p>
      ${p.notes ? `<p><b>ملاحظات:</b> ${p.notes}</p>` : ""}
    `);
  });

  svg.on("click", () => resetFocus(nodes, links));

  document.getElementById("resetView").onclick = () => {
    resetFocus(nodes, links);
    fitToScreen(container, 110);
  };
  document.getElementById("zoomIn").onclick = () => svg.transition().duration(150).call(zoomBehavior.scaleBy, 1.18);
  document.getElementById("zoomOut").onclick = () => svg.transition().duration(150).call(zoomBehavior.scaleBy, 0.85);
  document.getElementById("fit").onclick = () => fitToScreen(container, 110);

  document.getElementById("focusMode").onclick = () => {
    openModal(`<h3 style="margin:0 0 10px 0">وضع التركيز</h3>
      <p>اضغط على شخص: يظهر الشخص + الآباء + الأبناء المباشرين، ويخفي الإخوة وباقي الفروع.</p>
      <p>اضغط خارج الأشخاص أو على "عرض الشجرة كاملة" للعودة.</p>
    `);
  };

  const searchInput = document.getElementById("search");
  searchInput.oninput = () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      resetFocus(nodes, links);
      return;
    }
    nodes
      .attr("opacity", d => String(d.data.name).toLowerCase().includes(q) ? 1 : 0.12)
      .attr("pointer-events", d => String(d.data.name).toLowerCase().includes(q) ? "auto" : "none");
    links.attr("opacity", 0.08);
  };

  // fit أول مرة
  setTimeout(() => fitToScreen(container, 120), 0);

  // لو حصل resize للشاشة: اعمل fit خفيف (مش بيصغّر إلا لو لازم)
  window.addEventListener("resize", () => {
    clearTimeout(window.__fitTimer);
    window.__fitTimer = setTimeout(() => fitToScreen(container, 120), 120);
  });
}

/* ===== Init ===== */
(async function init() {
  try {
    const root = await fetchTree();
    if (!root) {
      document.getElementById("tree").innerHTML =
        "<div style='padding:14px;color:var(--muted)'>لا توجد بيانات بعد.</div>";
      return;
    }
    renderTree(root);
  } catch (e) {
    console.error("Tree render error:", e);
    document.getElementById("tree").innerHTML =
      "<div style='padding:14px;color:var(--muted)'>حدث خطأ أثناء تحميل الشجرة. افتح Console لمعرفة السبب.</div>";
  }
})();
