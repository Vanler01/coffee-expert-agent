// เอนจินเว็บเวอร์ชัน — แปลจาก Python ทีละฟังก์ชัน (quick_answers.py, retrieval.py, answer_cache.py, planning.py)
// ข้อมูลทั้งหมดมาจาก data.json ที่ web/export_data.py ส่งออกจากโค้ด Python ตัวจริง
// ทดสอบว่าให้ผลตรงกับ Python ทุกข้อด้วย web/test_engine.mjs (node) — แก้ฝั่งไหนต้องรันเทสต์นั้น
// ใช้ได้ทั้งในเบราว์เซอร์ (globalThis.CoffeeEngine) และ node (import)
(function (root) {
  "use strict";

  // ------------------------------------------------------------ ตัวช่วยให้ผลเหมือน Python
  // Python ปัด .5 ไปหาเลขคู่ (62.5 → "62") แต่ JS toFixed ปัดขึ้น → เขียนเองให้ตรง
  function roundHalfEven(x) {
    const f = Math.floor(x), d = x - f;
    if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
    return Math.round(x);
  }
  function fmt0(x) { return String(roundHalfEven(x)); }
  function fmt1(x) {
    const v = roundHalfEven(x * 10) / 10;
    let s = v.toFixed(1);
    s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }
  const r = (x) => (x >= 10 ? fmt0(x) : fmt1(x));                       // _r
  const rng = (a, b, unit) => (r(a) === r(b) ? `${r(a)} ${unit}` : `${r(a)}–${r(b)} ${unit}`);
  const fl = (x) => parseFloat(String(x).replace(",", "."));              // _f
  const first = (m) => fl(m.slice(1).find((g) => g !== undefined && g !== ""));
  const format = (tpl, vals) => tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vals ? String(vals[k]) : `{${k}}`));
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const collapse = (t) => String(t || "").split(/\s+/).filter(Boolean).join(" ");
  const THAI = /[฀-๿]/;

  // Python regex → JS RegExp
  // \b และ \w ของ Python รู้จักตัวอักษรทุกภาษา (ไทยด้วย) แต่ของ JS รู้จักแค่ a-z → "50 กรัม" จับไม่ได้
  // จึงแปลงเป็นคลาส Unicode ที่นิยามเหมือน Python: ตัวอักษร + ตัวเลข + _ (สระ/วรรณยุกต์ซ้อนไม่นับ เหมือน Python)
  const W = "\\p{L}\\p{N}_";
  const BOUND = `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`;
  function pyRe(p, flags) {
    let out = "", inClass = false;
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === "\\") {
        const n = p[++i];
        if (n === "b" && !inClass) out += BOUND;
        else if (n === "w") out += inClass ? W : `[${W}]`;
        else if (n === "W" && !inClass) out += `[^${W}]`;
        else if (/[A-Za-z0-9]/.test(n) || "\\^$.|?*+()[]{}/-".includes(n)) out += "\\" + n;
        else out += n;                                   // escape ที่ Python ยอมแต่โหมด u ของ JS ไม่ยอม (เช่น \') → ตัวอักษรเฉย ๆ
        continue;
      }
      if (c === "[" && !inClass) inClass = true;
      else if (c === "]" && inClass) inClass = false;
      out += c;
    }
    return new RegExp(out, flags + "u");
  }
  const rxI = (p) => pyRe(p, "i");
  const rx = (p) => pyRe(p, "");

  function create(D) {
    const T = D.topics.map((t) => Object.assign({}, t, { re: rxI(t.rx) }));
    const BY = Object.fromEntries(T.map((t) => [t.id, t]));
    const R = D.rx;
    const COMPLEX = rxI(R.complex), QUESTION = rxI(R.question);
    const COFFEE_AMT = rxI(R.coffee_amt), WATER_AMT = rxI(R.water_amt), YIELD_AMT = rxI(R.yield_amt);
    const ANY_G = rxI(R.any_g), ANY_ML = rxI(R.any_ml), CUPS = rxI(R.cups), PER_CUP = rxI(R.per_cup);
    const WANT_COFFEE = rxI(R.want_coffee), SHOT_N = rxI(R.shot_n), DOUBLE = rxI(R.double);
    const CONC = rxI(R.conc), DILUTE = rxI(R.dilute);
    const VARIANT = Object.entries(R.variant).map(([k, p]) => [k, rxI(p)]);
    const GLOSSARY = D.glossary.map(([p, th]) => [rxI(p), th]);
    const SHOTS = new Set(D.shots);
    const RATIO_IDS = Object.keys(D.ratios);   // ลำดับเดียวกับ dict ของ Python
    const flavorRe = Object.fromEntries(Object.keys(D.flavor_cat).map(
      (n) => [n, new RegExp(`(?<![A-Za-z])${escapeRe(n)}(?![A-Za-z])`)]));

    const related = (t, lang) => t.related.filter((id) => BY[id] && BY[id].ask && BY[id].ask[lang])
      .map((id) => BY[id].ask[lang]);

    // ------------------------------------------------------------ เครื่องคิดสูตรชง (quick_answers.brew_calc)
    function special(text, lang) {
      const k = D.calc[lang];
      let m;
      if (BY.coldbrew.re.test(text) && (m = text.match(CONC)) && DILUTE.test(text)) {
        const c = fl(m[1]) * (m[2] ? 1000 : 1);
        if (!(c > 0 && c <= 20000)) return null;
        const w = rng(c / 2, c, "ml"), t = BY.coldbrew;
        return { kind: "calc", id: "coldbrew-dilute", title: format(k.dil_title, { c: r(c), w }),
          lines: [format(k.dil_eq, { c: r(c), w, t: rng(c * 1.5, c * 2, "ml") }), t.lines[lang][t.lines[lang].length - 1]],
          sources: t.labels.slice(), related: related(t, lang) };
      }
      if (BY.turkish.re.test(text)) {
        const cups = text.match(CUPS), vol = text.match(ANY_ML), pre = [];
        let n;
        if (cups) n = parseInt(cups[1], 10);
        else if (vol) {
          const w = first(vol) * (vol[2] ? 1000 : 1);
          n = Math.max(1, roundHalfEven(w / D.cup_ml.turkish));
          pre.push(format(k.tk_cups, { w: r(w), n }));
        } else return null;
        if (!(n > 0 && n <= 50)) return null;
        const t = BY.turkish, c = rng(n * D.turkish_g, n * D.turkish_g, "g");
        return { kind: "calc", id: "turkish", title: format(k.tk_title, { n, w: r(n * D.cup_ml.turkish), c }),
          lines: pre.concat([format(k.tk_eq, { n, c })], t.lines[lang].filter((ln) => !ln.includes("7 g"))),
          sources: t.labels.slice(), related: related(t, lang) };
      }
      return null;
    }

    function brewCalc(text, lang) {
      const sp = special(text, lang);
      if (sp) return sp;
      let method = RATIO_IDS.find((id) => BY[id] && BY[id].re.test(text));
      if (!method) {
        const nr = D.no_ratio.find((id) => BY[id].re.test(text));
        if (nr && (ANY_G.test(text) || ANY_ML.test(text))) {
          const t = BY[nr];
          return { kind: "local", id: nr, title: t.title[lang],
            lines: [format(D.calc[lang].noratio, { m: t.title[lang] })].concat(t.lines[lang]),
            sources: t.labels.slice(), related: related(t, lang) };
        }
        return null;
      }
      if (method === "espresso") method = (VARIANT.find(([, re]) => re.test(text)) || ["espresso"])[0];
      const k = D.calc[lang];
      const topic = BY[SHOTS.has(method) ? "espresso" : method];
      const [nameTh, nameEn, lo, hi] = D.ratios[method];
      const name = lang === "th" ? nameTh : nameEn;
      const rTxt = `1:${r(lo)}` + (hi === lo ? "" : hi === null ? ` ${k.at_least}` : `–1:${r(hi)}`);
      const rEq = hi === lo ? r(lo) : hi === null ? `≥ ${r(lo)}` : `${r(lo)}–${r(hi)}`;
      const hi_ = hi !== null ? hi : lo;
      const more = hi === null ? ` ${k.at_least}` : "";

      const pre = [];
      let coffee = null, yld = null, water = null, m;
      const cups = text.match(CUPS), per = text.match(PER_CUP);
      if (cups && per) {
        const n = parseInt(cups[1], 10), v = first(per);
        water = n * v;
        pre.push(format(k.cups, { n, v: r(v), w: r(water) }));
      } else if (cups && method in D.cup_ml && !ANY_G.test(text) && !ANY_ML.test(text)) {
        const n = parseInt(cups[1], 10), v = D.cup_ml[method];
        water = n * v;
        pre.push(format(k.cupstd, { n, v, w: r(water) }));
      } else if (SHOTS.has(method) && !ANY_G.test(text) && !ANY_ML.test(text) &&
                 ((m = text.match(SHOT_N)) || DOUBLE.test(text))) {
        const n = m ? parseInt(m[1], 10) : 2;
        coffee = n * D.shot_g;
        pre.push(format(k.shots, { n, c: r(coffee) }));
      } else if (SHOTS.has(method) && (m = text.match(YIELD_AMT) || text.match(WATER_AMT))) {
        yld = first(m);
      } else if ((m = text.match(COFFEE_AMT))) {
        coffee = first(m);
      } else if ((m = text.match(WATER_AMT))) {
        water = first(m);
      } else if ((m = text.match(ANY_ML))) {
        water = first(m) * (m[2] ? 1000 : 1);
      } else if ((m = text.match(ANY_G)) && (SHOTS.has(method) || !WANT_COFFEE.test(text))) {
        coffee = first(m);
      } else if (cups) {
        return { kind: "local", id: topic.id, title: topic.title[lang],
          lines: [k.cuphint].concat(topic.lines[lang]), sources: topic.labels.slice(), related: related(topic, lang) };
      } else return null;
      if (SHOTS.has(method) && coffee === null && yld === null && water !== null) { yld = water; water = null; }

      const amount = [coffee, yld, water].find((x) => x !== null);
      if (!(amount > 0 && amount <= 20000)) return null;
      let title, body;
      if (SHOTS.has(method)) {
        let cTxt, outTxt, eq;
        if (coffee !== null) {
          cTxt = rng(coffee, coffee, "g"); outTxt = rng(coffee * lo, coffee * hi_, "g") + more;
          eq = format(k.eq_y, { r: rEq, work: `${r(coffee)} × ${hi === null ? r(lo) : rEq} = ${outTxt}` });
        } else {
          cTxt = rng(yld / hi_, yld / lo, "g"); outTxt = rng(yld, yld, "g");
          if (hi === null) cTxt = `≤ ${r(yld / lo)} g`;
          eq = format(k.eq_d, { r: rEq, work: `${r(yld)} ÷ ${hi === null ? r(lo) : rEq} = ${cTxt}` });
        }
        title = format(k.shot, { m: name, c: cTxt, w: outTxt });
        body = [eq, k.shotfix].concat(topic.lines[lang].filter((ln) => ln.includes("→") && !ln.includes("1:")).slice(0, 1));
      } else {
        let cTxt, wTxt, eq;
        if (coffee !== null) {
          cTxt = rng(coffee, coffee, "g"); wTxt = rng(coffee * lo, coffee * hi_, "g");
          eq = format(k.eq_w, { r: rEq, work: `${r(coffee)} × ${rEq} = ${wTxt}` });
        } else {
          cTxt = rng(water / hi_, water / lo, "g"); wTxt = rng(water, water, "ml");
          eq = format(k.eq_c, { r: rEq, work: `${r(water)} ÷ ${rEq} = ${cTxt}` });
        }
        title = format(k.title, { m: name, c: cTxt, w: wTxt });
        let rest = topic.lines[lang].filter((ln) => !/1:\d/.test(ln));
        if (method === "pourover") {
          const cMid = coffee !== null ? coffee : water / ((lo + hi_) / 2);
          rest = rest.map((ln) => (ln.toLowerCase().startsWith("bloom") ? format(k.bloom, { c: r(cMid), b: r(2 * cMid) }) : ln));
        }
        body = [eq].concat(rest.slice(0, 4));
      }
      return { kind: "calc", id: method, title, lines: pre.concat(body, [format(k.assume, { r: rTxt })]),
        sources: topic.labels.slice(), related: related(topic, lang) };
    }

    // ------------------------------------------------------------ ตอบทันที (quick_answers.answer)
    function matchTopics(text) {
      const hits = T.filter((t) => t.re.test(text));
      const covered = new Set(hits.flatMap((t) => t.covers));
      return hits.filter((t) => !covered.has(t.id));
    }

    function answer(raw, lang) {
      const text = collapse(raw);
      if (!D.langs.includes(lang) || !text || text.length > 200) return null;
      const calc = brewCalc(text, lang);
      if (calc) return calc;
      if (!(QUESTION.test(text) || text.length <= R.short)) return null;
      const hits = matchTopics(text);
      if (hits.length !== 1) return null;
      const t = hits[0];
      if (COMPLEX.test(text) && !t.allow_compare) return null;
      return { kind: "local", id: t.id, title: t.title[lang], lines: t.lines[lang].slice(),
        sources: t.labels.slice(), related: related(t, lang) };
    }
    const asText = (card) => card.title + "\n" + card.lines.map((l) => `- ${l}`).join("\n");

    // ------------------------------------------------------------ ขยายคำค้น / anchors
    function flavorCats(q) {
      const cats = [];
      for (const [n, cat] of Object.entries(D.flavor_cat)) if (!cats.includes(cat) && flavorRe[n].test(q)) cats.push(cat);
      return cats.slice(0, 2);
    }
    function expandQuery(q) {
      const hits = T.filter((t) => t.re.test(q) && t.labels && t.labels.length);
      const titles = flavorCats(q).map((c) => `กลิ่นรสหมวด ${c}`);
      for (const t of hits.slice(0, 3)) for (const label of t.labels.slice(0, 2)) {
        const title = label.includes("§ ") ? label.split("§ ").slice(1).join("§ ") : label;
        if (!titles.includes(title)) titles.push(title);
      }
      let extra = titles;
      if (!THAI.test(q)) extra = titles.concat(GLOSSARY.filter(([re]) => re.test(q)).map(([, th]) => th));
      return extra.length ? `${q} ${extra.join(" ")}` : q;
    }
    function anchors(text) {
      const s = new Set(T.filter((t) => t.re.test(text)).map((t) => t.id));
      for (const n of Object.keys(D.flavor_cat)) if (flavorRe[n].test(text)) s.add(n);
      for (const d of text.match(/\d+(?:[.,]\d+)?/g) || []) s.add(d);
      return [...s].sort();
    }

    // ------------------------------------------------------------ BM25 (retrieval.py)
    const { k1: K1, b: B, ngram: NG, title_weight: TW } = D.bm25;
    function tokenize(text) {
      const out = (String(text).match(/[a-zA-Z0-9]+/g) || []).map((w) => w.toLowerCase());
      for (const run of String(text).match(/[฀-๿]+/g) || []) {
        if (run.length <= NG) out.push(run);
        else for (let i = 0; i + NG <= run.length; i++) out.push(run.slice(i, i + NG));
      }
      return out;
    }
    const docs = D.chunks.map((c) => { const t = tokenize(c.title); let d = []; for (let i = 0; i < TW; i++) d = d.concat(t); return d.concat(tokenize(c.text)); });
    const freqs = docs.map((d) => { const m = new Map(); for (const w of d) m.set(w, (m.get(w) || 0) + 1); return m; });
    const lengths = docs.map((d) => d.length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
    const df = new Map();
    for (const f of freqs) for (const w of f.keys()) df.set(w, (df.get(w) || 0) + 1);
    const idf = new Map();
    for (const [w, n] of df) idf.set(w, Math.log(1 + (docs.length - n + 0.5) / (n + 0.5)));
    function search(query, k = 5, minScore = 0.5) {
      const terms = tokenize(query);
      if (!terms.length) return [];
      const scored = [];
      freqs.forEach((f, i) => {
        let s = 0;
        for (const w of terms) {
          const c = f.get(w);
          if (!c) continue;
          s += (idf.get(w) || 0) * (c * (K1 + 1) / (c + K1 * (1 - B + B * lengths[i] / (avgLen || 1))));
        }
        if (s > 0) scored.push([s, i]);
      });
      scored.sort((a, b) => b[0] - a[0]);
      return scored.slice(0, k).filter(([s]) => s >= minScore).map(([s, i]) => ({
        source: D.chunks[i].label, text: D.chunks[i].text, score: Math.round(s * 100) / 100, mode: "bm25" }));
    }

    // ------------------------------------------------------------ cache: คำถามคล้ายกัน (answer_cache.py)
    const TAIL = rx(R.tail);
    function normalize(t) {
      let s = collapse(String(t).toLowerCase());
      for (let i = 0; i < 3; i++) s = s.replace(TAIL, "").trim();
      return s;
    }
    function grams(t) {
      const s = normalize(t).replace(/ /g, "");
      const g = new Set();
      for (let i = 0; i < Math.max(s.length - 2, 1); i++) g.add(s.slice(i, i + 3));
      return g;
    }
    function similarity(a, b) {
      const ga = grams(a), gb = grams(b);
      if (!ga.size || !gb.size) return 0;
      let inter = 0;
      for (const g of ga) if (gb.has(g)) inter++;
      return 2 * inter / (ga.size + gb.size);
    }

    // ------------------------------------------------------------ วางแผน/ตรวจทานในเครื่อง (planning.py โหมดประหยัด)
    const NUM = /\d+(?:[.,]\d+)*/g, LIST_MARK = /^\s*\d+[.)]\s/gm;
    const numbers = (t) => new Set((String(t).replace(LIST_MARK, "").match(NUM) || []).map((n) => n.replace(/,/g, "")));
    function localPlan(q, sources, language) {
      const heads = sources.map((s) => (s.includes("§ ") ? s.split("§ ").slice(1).join("§ ") : s));
      return { intent: collapse(q).slice(0, 160),
        key_information: heads.length ? heads.slice(0, 4) : ["(ค้นล่วงหน้าแล้วไม่พบหัวข้อที่ตรง)"],
        category: "knowledge",
        subgoals: [
          "อ่านข้อความจากฐานความรู้ที่ค้นไว้ล่วงหน้า (" + (heads.slice(0, 3).join(", ") || "ไม่มี") + ")",
          "ถ้ายังไม่พอ ค้นเพิ่มด้วย search_domain ไม่งั้นบอกว่าไม่รู้",
          `เรียบเรียงคำตอบเป็น${language || "ภาษาเดียวกับผู้ใช้"} ตัวเลขต้องตรงกับข้อความที่ค้นได้`] };
    }
    function formatPlan(p) {
      return [`Intent: ${p.intent}`, `Category: ${p.category}`, "Key information:"]
        .concat(p.key_information.map((x) => `- ${x}`), ["Subgoals:"], p.subgoals.map((g, i) => `${i + 1}. ${g}`)).join("\n");
    }
    function localCheck(question, ans, evidence, language) {
      const issues = [];
      if (!ans.trim()) issues.push("The answer is empty.");
      const allowed = new Set([...numbers(evidence), ...numbers(question), ...Array.from({ length: 11 }, (_, i) => String(i))]);
      const extra = [...numbers(ans)].filter((n) => !allowed.has(n)).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
      if (extra.length) issues.push("These numbers are not in the retrieved knowledge text: " + extra.slice(0, 8).join(", ")
        + ". Use only numbers that appear in the knowledge text, or remove them.");
      if (language && !language.toLowerCase().startsWith("thai") && THAI.test(ans))
        issues.push(`The answer contains Thai text; write it entirely in ${language}.`);
      return { approved: !issues.length, issues, lesson: "" };
    }

    return { answer, asText, brewCalc, expandQuery, anchors, search, tokenize, normalize, similarity,
      localPlan, formatPlan, localCheck, matchTopics, data: D };
  }

  const api = { create, roundHalfEven, fmt0, fmt1 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CoffeeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
