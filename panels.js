// ข้อมูลและตัวเรนเดอร์ของแผงเสริม: Coffee Taster's Flavor Wheel และ Roast Level Bar
// สีอ้างอิงจาก SCAA / World Coffee Research Coffee Taster's Flavor Wheel

// ---------------------------------------------------------------- Flavor Wheel
// โครงสร้าง 3 วง: หมวดใหญ่ → หมวดย่อย → กลิ่นรสเฉพาะ
// ชื่อกลิ่นรสคงเป็นภาษาอังกฤษตามมาตรฐานสากล เพราะเป็นศัพท์ที่ใช้อ้างอิงกันทั่วโลก
window.FLAVOR_WHEEL = [
  { name: "FLORAL", color: "#E6007E", children: [
    { name: "BLACK TEA", color: "#A8576B", children: [] },
    { name: "FLORAL", color: "#F074AE", children: [
      { name: "CHAMOMILE", color: "#F59D1F" },
      { name: "ROSE", color: "#F3C3D6" },
      { name: "JASMINE", color: "#F7EFA8" },
    ]},
  ]},
  { name: "FRUITY", color: "#E32119", children: [
    { name: "BERRY", color: "#E8392F", children: [
      { name: "BLACKBERRY", color: "#2B1A16" },
      { name: "RASPBERRY", color: "#E8425A" },
      { name: "BLUEBERRY", color: "#5566B4" },
      { name: "STRAWBERRY", color: "#E23C4C" },
    ]},
    { name: "DRIED FRUIT", color: "#C2333A", children: [
      { name: "RAISIN", color: "#8E4B52" },
      { name: "PRUNE", color: "#7A3B46" },
    ]},
    { name: "OTHER FRUIT", color: "#F2704B", children: [
      { name: "COCONUT", color: "#C9A46B" },
      { name: "CHERRY", color: "#DC3B4A" },
      { name: "POMEGRANATE", color: "#D9455E" },
      { name: "PINEAPPLE", color: "#F4B63F" },
      { name: "GRAPE", color: "#A9BF52" },
      { name: "APPLE", color: "#9CC74A" },
      { name: "PEACH", color: "#F6A05C" },
      { name: "PEAR", color: "#C8CE68" },
    ]},
    { name: "CITRUS FRUIT", color: "#F0922B", children: [
      { name: "GRAPEFRUIT", color: "#EE8A5E" },
      { name: "ORANGE", color: "#F28D3C" },
      { name: "LEMON", color: "#F7E200" },
      { name: "LIME", color: "#93C13D" },
    ]},
  ]},
  { name: "SOUR/FERMENTED", color: "#F0C41B", children: [
    { name: "SOUR", color: "#F4D03F", children: [
      { name: "SOUR AROMATICS", color: "#9FAE52" },
      { name: "ACETIC ACID", color: "#A9B37A" },
      { name: "BUTYRIC ACID", color: "#BFC48A" },
      { name: "ISOVALERIC ACID", color: "#D3D191" },
      { name: "CITRIC ACID", color: "#F5E33A" },
      { name: "MALIC ACID", color: "#E2D24F" },
    ]},
    { name: "ALCOHOL/FERMENTED", color: "#D9A521", children: [
      { name: "WINEY", color: "#8E2C4B" },
      { name: "WHISKEY", color: "#B4423A" },
      { name: "FERMENTED", color: "#B58A3C" },
      { name: "OVERRIPE", color: "#9A7B3A" },
    ]},
  ]},
  { name: "GREEN/VEGETATIVE", color: "#0F8A4C", children: [
    { name: "OLIVE OIL", color: "#8FA62E", children: [] },
    { name: "RAW", color: "#6FA83C", children: [] },
    { name: "GREEN/VEGETATIVE", color: "#3FA65C", children: [
      { name: "UNDER-RIPE", color: "#A8C63E" },
      { name: "PEAPOD", color: "#7FB93F" },
      { name: "FRESH", color: "#5FB76B" },
      { name: "DARK GREEN", color: "#2F7A45" },
      { name: "VEGETATIVE", color: "#63A94A" },
      { name: "HAY-LIKE", color: "#BFC57A" },
      { name: "HERB-LIKE", color: "#8CBF62" },
    ]},
    { name: "BEANY", color: "#9BB37A", children: [] },
  ]},
  { name: "OTHER", color: "#2AA9C4", children: [
    { name: "PAPERY/MUSTY", color: "#A9B4BC", children: [
      { name: "STALE", color: "#C9C3AE" },
      { name: "CARDBOARD", color: "#BFB9A0" },
      { name: "PAPERY", color: "#EDEAE0" },
      { name: "WOODY", color: "#8A6B47" },
      { name: "MOLDY/DAMP", color: "#8E8B5E" },
      { name: "MUSTY/DUSTY", color: "#B5A77E" },
      { name: "MUSTY/EARTHY", color: "#9B8A55" },
      { name: "ANIMALIC", color: "#A89A86" },
      { name: "MEATY BROTHY", color: "#B07A6A" },
      { name: "PHENOLIC", color: "#C4626B" },
    ]},
    { name: "CHEMICAL", color: "#63C6D8", children: [
      { name: "BITTER", color: "#9AA7AC" },
      { name: "SALTY", color: "#C6D2D6" },
      { name: "MEDICINAL", color: "#8FA8B4" },
      { name: "PETROLEUM", color: "#2C9FD4" },
      { name: "SKUNKY", color: "#6E7C82" },
      { name: "RUBBER", color: "#1A1A1A" },
    ]},
  ]},
  { name: "ROASTED", color: "#D4452C", children: [
    { name: "PIPE TOBACCO", color: "#B08A5E", children: [] },
    { name: "TOBACCO", color: "#A87445", children: [] },
    { name: "BURNT", color: "#C08A5A", children: [
      { name: "ACRID", color: "#C8A96A" },
      { name: "ASHY", color: "#A9A192" },
      { name: "SMOKY", color: "#8A5A3C" },
      { name: "BROWN, ROAST", color: "#6B3A22" },
    ]},
    { name: "CEREAL", color: "#E2C083", children: [
      { name: "GRAIN", color: "#D6C39A" },
      { name: "MALT", color: "#F0A85C" },
    ]},
  ]},
  { name: "SPICES", color: "#9B2033", children: [
    { name: "PUNGENT", color: "#3B2A4A", children: [] },
    { name: "PEPPER", color: "#8E2F3E", children: [] },
    { name: "BROWN SPICE", color: "#A33D48", children: [
      { name: "ANISE", color: "#C98A94" },
      { name: "NUTMEG", color: "#8E4A3C" },
      { name: "CINNAMON", color: "#D96A4A" },
      { name: "CLOVE", color: "#B0503C" },
    ]},
  ]},
  { name: "NUTTY/COCOA", color: "#C98A5E", children: [
    { name: "NUTTY", color: "#D9A87C", children: [
      { name: "PEANUTS", color: "#E0B84A" },
      { name: "HAZELNUT", color: "#C99A6B" },
      { name: "ALMOND", color: "#E6C9A0" },
    ]},
    { name: "COCOA", color: "#A8703F", children: [
      { name: "CHOCOLATE", color: "#7A4326" },
      { name: "DARK CHOCOLATE", color: "#4A2617" },
    ]},
  ]},
  { name: "SWEET", color: "#F5A623", children: [
    { name: "BROWN SUGAR", color: "#C4703C", children: [
      { name: "MOLASSES", color: "#5E3220" },
      { name: "MAPLE SYRUP", color: "#8E4A28" },
      { name: "CARAMELIZED", color: "#E07B2C" },
      { name: "HONEY", color: "#F0A93C" },
    ]},
    { name: "VANILLA", color: "#E8C9A8", children: [] },
    { name: "VANILLIN", color: "#F0DCC4", children: [] },
    { name: "OVERALL SWEET", color: "#F5E3CE", children: [] },
    { name: "SWEET AROMATICS", color: "#C2A08E", children: [] },
  ]},
];

// ---------------------------------------------------------------- Roast Levels
// สีเมล็ดอ้างอิงจากสีจริงของเมล็ดคั่วแต่ละระดับ (โรบัสต้าออกโทนเทา-เขียวมากกว่าตอนเป็นเมล็ดสาร)
window.ROAST_LEVELS = [
  { id: "green",      name: "Green (เมล็ดสาร)", temp: "—",
    arabica: "#9CA86B", robusta: "#A8A47A", crack: "", gloss: 0 },
  { id: "cinnamon",   name: "Cinnamon / Light", temp: "196–200°C",
    arabica: "#B98A54", robusta: "#B08A60", crack: "first", gloss: 0 },
  { id: "city",       name: "City / Light-Medium", temp: "200–205°C",
    arabica: "#9A6537", robusta: "#96683F", crack: "first", gloss: 0 },
  { id: "cityplus",   name: "City+ / Medium", temp: "210–220°C",
    arabica: "#7E4A28", robusta: "#7C4E30", crack: "first", gloss: 0.15 },   // หลัง First Crack ยังไม่ถึง Second (เดิมเป็น "" แล้วขึ้นว่า "ยังไม่คั่ว")
  { id: "fullcity",   name: "Full City / Medium-Dark", temp: "~225°C",
    arabica: "#5E3520", robusta: "#5C3822", crack: "second", gloss: 0.5 },
  { id: "french",     name: "French / Dark", temp: "230–235°C",
    arabica: "#3E2115", robusta: "#3C2317", crack: "second", gloss: 0.85 },
  { id: "italian",    name: "Italian / Very Dark", temp: "235°C+",
    arabica: "#241009", robusta: "#231209", crack: "second", gloss: 1 },
];

// ---------------------------------------------------------------- ตัวเรนเดอร์ wheel
function countLeaves(node) {
  if (!node.children || !node.children.length) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

function arcPath(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1);
  const [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

function readableOn(hex) {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#2c2018" : "#ffffff";
}

/** วาด flavor wheel เป็น SVG · onPick(ชื่อกลิ่นรส) ถูกเรียกเมื่อคลิกช่อง */
window.renderFlavorWheel = function (container, onPick) {
  const SIZE = 760, cx = SIZE / 2, cy = SIZE / 2;
  const RINGS = [[70, 132], [132, 210], [210, 286]];   // รัศมี 3 วง
  const total = window.FLAVOR_WHEEL.reduce((s, n) => s + countLeaves(n), 0);
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("class", "wheel-svg");

  let angle = -Math.PI / 2;   // เริ่มที่ 12 นาฬิกา

  function draw(node, depth, a0, a1) {
    const [r0, r1] = RINGS[depth];
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", arcPath(cx, cy, r0, r1, a0, a1));
    path.setAttribute("fill", node.color);
    path.setAttribute("stroke", "rgba(255,255,255,.55)");
    path.setAttribute("stroke-width", "1");
    path.setAttribute("class", "wedge");
    path.addEventListener("click", () => onPick && onPick(node.name));
    const t = document.createElementNS(svgNS, "title");
    t.textContent = node.name;
    path.appendChild(t);
    svg.appendChild(path);

    // ป้ายชื่อ — วงในวางตามแนวโค้ง วงนอกวางแนวรัศมี
    const mid = (a0 + a1) / 2, span = a1 - a0;
    const deg = mid * 180 / Math.PI;
    const label = document.createElementNS(svgNS, "text");
    label.textContent = node.name;
    label.setAttribute("class", "wedge-label");
    label.setAttribute("fill", readableOn(node.color));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("pointer-events", "none");
    const rMid = (r0 + r1) / 2;
    const x = cx + rMid * Math.cos(mid), y = cy + rMid * Math.sin(mid);
    let size = depth === 0 ? 11 : depth === 1 ? 9 : 7.5;

    // ทิศของป้าย: วงในสุดวางตามส่วนโค้งเสมอ (เหมือนโปสเตอร์ต้นฉบับ)
    // วงนอกสุดวางตามรัศมีเสมอ วงกลางเลือกทิศที่ใส่ตัวอักษรได้ใหญ่กว่า
    const arcLen = span * rMid, ringLen = r1 - r0;
    const perChar = size * 0.62;
    let radial;
    if (depth === 0) radial = false;
    else if (depth === 2) radial = true;
    else radial = ringLen > arcLen;

    // ย่อขนาดตัวอักษรให้พอดีช่องที่มี ไม่ให้ล้นออกไปทับช่องอื่น
    const room = (radial ? ringLen : arcLen) * 0.94;
    const needed = node.name.length * perChar;
    if (needed > room) size = Math.max(size * room / needed, 4.6);
    label.setAttribute("font-size", size);

    // หมุนให้อ่านได้เสมอ — ถ้ามุมทำให้ข้อความกลับหัว ให้พลิก 180 องศา
    let rot = radial ? deg : deg + 90;
    rot = ((rot + 180) % 360 + 360) % 360 - 180;       // ปรับให้อยู่ในช่วง (-180, 180]
    if (rot > 90 || rot < -90) rot += 180;
    label.setAttribute("transform", `rotate(${rot} ${x} ${y})`);
    label.setAttribute("x", x); label.setAttribute("y", y);
    svg.appendChild(label);
  }

  function walk(nodes, depth, start, sweep) {
    const leaves = nodes.reduce((s, n) => s + countLeaves(n), 0);
    let a = start;
    for (const node of nodes) {
      const share = countLeaves(node) / leaves * sweep;
      draw(node, depth, a, a + share);
      if (node.children && node.children.length && depth < 2) {
        walk(node.children, depth + 1, a, share);
      }
      a += share;
    }
  }
  walk(window.FLAVOR_WHEEL, 0, angle, Math.PI * 2);

  container.innerHTML = "";
  container.appendChild(svg);
};

// ---------------------------------------------------------------- ตัวเรนเดอร์เมล็ด
/** วาดเมล็ดกาแฟ 1 เมล็ด
 *  - โรบัสต้ากลมกว่าและรอยผ่ากลางตรงกว่าอาราบิก้าที่โค้งเป็นตัว S
 *  - gloss 0..1 คือความมันวาวจากน้ำมันที่ซึมออกผิวเมล็ดเมื่อคั่วเข้ม
 */
window.beanSvg = function (color, kind, gloss = 0) {
  const robusta = kind === "robusta";
  const rx = robusta ? 40 : 34, ry = 46;
  const crease = robusta
    ? "M50 14 L50 78"                                  // โรบัสต้า: รอยผ่าตรง
    : "M50 14 C40 32, 60 60, 50 78";                   // อาราบิก้า: รอยผ่าโค้งเป็นตัว S
  const sheen = gloss > 0
    ? `<ellipse cx="${robusta ? 36 : 39}" cy="28" rx="${robusta ? 15 : 12}" ry="19"
                fill="rgba(255,255,255,${(0.16 * gloss).toFixed(3)})"
                transform="rotate(-18 40 28)"/>`
    : "";
  return `<svg viewBox="0 0 100 100" class="bean">
    <ellipse cx="50" cy="46" rx="${rx}" ry="${ry}" fill="${color}"/>
    ${sheen}
    <ellipse cx="50" cy="46" rx="${rx}" ry="${ry}" fill="none"
             stroke="rgba(0,0,0,.28)" stroke-width="2"/>
    <path d="${crease}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
};
