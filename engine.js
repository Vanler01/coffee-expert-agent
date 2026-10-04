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

    // ------------------------------------------------------------ จับคู่ คั่ว × เมนู × เมล็ด (pairings.py)
    const PD = D.pairings || null;
    const PR = PD ? Object.fromEntries(PD.roasts.map((x) => [x.id, x])) : {};
    const PB = PD ? Object.fromEntries(PD.beans.map((x) => [x.id, x])) : {};
    const PM = PD ? Object.fromEntries(PD.menus.map((x) => [x.id, x])) : {};
    const PTAB = { R: PR, B: PB, M: PM };
    const PRX = PD ? Object.fromEntries(Object.entries(PD.rx).map(([k, p]) => [k, rxI(p)])) : {};
    const ATTRS = ["acidity", "body", "sweetness"];
    const latin = (ch) => (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9");

    function pFind(text) {
      const s = text.toLowerCase();
      const taken = new Array(s.length).fill(false);
      let hits = [];
      for (const [alias, kind, id, weak] of PD.entries) {
        let start = 0;
        const lat = [...alias].some(latin);
        for (;;) {
          const i = s.indexOf(alias, start);
          if (i < 0) break;
          const j = i + alias.length;
          start = i + 1;
          if (lat && ((i > 0 && latin(s[i - 1])) || (j < s.length && latin(s[j])))) continue;
          if (taken.slice(i, j).some(Boolean)) continue;
          for (let k = i; k < j; k++) taken[k] = true;
          hits.push([i, kind, id, weak]);
        }
      }
      const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
      hits.sort((a, b) => a[0] - b[0] || cmp(a[1], b[1]) || cmp(a[2], b[2]) || (a[3] - b[3]));
      if (hits.some((h) => h[3]) && hits.some((h) => h[1] === "bean" && !h[3]))
        hits = hits.filter((h) => !(h[1] === "bean" && h[3]));
      const out = { roast: [], bean: [], menu: [] };
      for (const [, kind, id] of hits) if (!out[kind].includes(id)) out[kind].push(id);
      return out;
    }
    const clamp = (x) => Math.max(1, Math.min(5, x));
    function afterRoast(b, rid) {
      const d = PR[rid].d || {};
      return Object.fromEntries(ATTRS.map((a) => [a, clamp(b[a] + (d[a] || 0))]));
    }
    function pScore(rid, mid, bid) {
      const m = PM[mid], b = PB[bid];
      if (rid === "green" || mid === "green-coffee-drink") {
        const ok = rid === "green" && mid === "green-coffee-drink";
        return { verdict: ok ? "ok" : (rid === "green" ? "green" : "no"), sm: ok ? 2 : 0, sb: 0, fit: 0, total: ok ? 4 : 0, adj: {} };
      }
      const sm = m.roast_best.includes(rid) ? 2 : m.roast_ok.includes(rid) ? 1 : 0;
      const sb = b.roast_best.includes(rid) ? 2 : b.roast_ok.includes(rid) ? 1 : 0;
      const adj = afterRoast(b, rid);
      const fit = ATTRS.filter((a) => m.want[a][0] <= adj[a] && adj[a] <= m.want[a][1]).length;
      const total = 2 * sm + 2 * sb + fit;
      const verdict = sm === 0 || sb === 0 || fit < 2 ? "no" : total >= 8 ? "best" : total >= 5 ? "ok" : "no";
      return { verdict, sm, sb, fit, total, adj };
    }
    const byTotal = (rows) => rows.sort((a, b) => b[0].total - a[0].total || a[1] - b[1]).map((r) => [r[2], r[0]]);
    const rankBeans = (mid, rid) => byTotal(PD.beans.map((b, i) => [pScore(rid, mid, b.id), i, b.id]));
    const bestRoast = (mid, bid) => byTotal(PD.roasts.map((r, i) => [r, i]).filter(([r]) => r.id !== "green")
      .map(([r, i]) => [pScore(r.id, mid, bid), i, r.id]));
    const menusFor = (bid, rid) => byTotal(PD.menus.map((m, i) => [m, i]).filter(([m]) => m.id !== "green-coffee-drink")
      .map(([m, i]) => [rid ? pScore(rid, m.id, bid) : bestRoast(m.id, bid)[0][1], i, m.id]));

    const pT = (lang) => PD.T[lang];
    const names = (ids, table, lang, limit) => ids.slice(0, limit).map((i) => PTAB[table][i][lang]).join(pT(lang).sep) || pT(lang).none;
    const shortRoast = (r, lang) => (lang === "th" ? r[lang].split(" (")[0] : r[lang]);
    const roastList = (ids, lang) => ids.map((i) => shortRoast(PR[i], lang)).join(pT(lang).sep);
    function beanLists(mid, rid) {
      const ranked = rankBeans(mid, rid);
      return [ranked.filter(([, s]) => s.verdict === "best").map(([b]) => b).slice(0, 6),
        ranked.filter(([, s]) => s.verdict === "ok").map(([b]) => b).slice(0, 4),
        ranked.slice().reverse().filter(([, s]) => s.verdict === "no").map(([b]) => b).slice(0, 3)];
    }
    function want(m, a, lang) {
      const [lo, hi] = m.want[a], lv = PD.LEVEL[lang];
      return lo === hi ? lv[lo] : format(pT(lang).range, { a: lv[lo], b: lv[hi] });
    }
    function reasons(rid, mid, bid, lang) {
      const t = pT(lang), m = PM[mid], b = PB[bid];
      if (rid === "green") return [t.green];
      const s = pScore(rid, mid, bid);
      const out = [format(t[`r_menu${s.sm}`], { menu: m[lang], list: roastList(m.roast_best, lang) }),
        format(t[`r_bean${s.sb}`], { bean: b[lang], list: roastList(b.roast_best, lang) })];
      for (const a of ATTRS) {
        const v = s.adj[a], ok = m.want[a][0] <= v && v <= m.want[a][1];
        out.push(format(t[ok ? "r_attr_ok" : "r_attr_bad"], { attr: PD.ATTR_NAME[lang][a], lv: PD.LEVEL[lang][v], want: want(m, a, lang) }));
      }
      return out;
    }
    const card = (id, title, lines, sources, lang) => ({ kind: "local", id: `pair:${id}`, title,
      lines: lines.concat([pT(lang).src_note]), sources, related: [] });
    const L = PD ? PD.labels : {};
    const menuLabel = (mid) => L.menu[mid], beanLabel = (bid) => L.bean[bid], roastLabel = (rid) => L.roast[rid];

    function cardMenuRoast(mid, rid, lang) {
      const t = pT(lang), m = PM[mid], r = PR[rid];
      const title = format(t.t_menu_roast, { menu: m[lang], roast: r[lang] });
      if (rid === "green" && mid !== "green-coffee-drink") return card(`${mid}+${rid}`, title, [t.green], [menuLabel(mid), roastLabel(rid)], lang);
      const sm = m.roast_best.includes(rid) ? 2 : m.roast_ok.includes(rid) ? 1 : 0;
      const [best, ok, avoid] = beanLists(mid, rid);
      const lines = [format(t.roast_for_menu, { menu: m[lang], v: PD.VERDICT[lang][sm === 2 ? "best" : sm === 1 ? "ok" : "no"] })];
      if (sm === 0) lines.push(format(t.r_menu0, { menu: m[lang], list: roastList(m.roast_best, lang) }));
      lines.push(format(t.best_beans, { list: names(best, "B", lang, 6) }));
      if (ok.length) lines.push(format(t.ok_beans, { list: names(ok, "B", lang, 4) }));
      if (avoid.length) lines.push(format(t.avoid_beans, { list: names(avoid, "B", lang, 3) }));
      lines.push(format(t.why, { why: m[`why_${lang}`] }));
      return card(`${mid}+${rid}`, title, lines, [menuLabel(mid), roastLabel(rid), L.rule], lang);
    }
    function cardTriple(mid, rid, bid, lang) {
      const t = pT(lang), m = PM[mid], r = PR[rid], b = PB[bid];
      const s = pScore(rid, mid, bid);
      const lines = [PD.VERDICT[lang][s.verdict]].concat(reasons(rid, mid, bid, lang));
      if (s.verdict !== "best") {
        const top = bestRoast(mid, bid).filter(([, sc]) => sc.verdict === "best").map(([x]) => x).slice(0, 2);
        if (top.length) lines.push(format(t.roasts_best, { list: roastList(top, lang) }));
      }
      lines.push(format(t.why, { why: m[`why_${lang}`] }));
      return card(`${mid}+${rid}+${bid}`, format(t.t_triple, { bean: b[lang], roast: r[lang], menu: m[lang] }),
        lines, [menuLabel(mid), beanLabel(bid), roastLabel(rid), L.rule], lang);
    }
    function cardPair(mid, bid, lang) {
      const t = pT(lang), m = PM[mid], b = PB[bid];
      const ranked = bestRoast(mid, bid);
      let lines = ranked.filter(([, s]) => s.verdict !== "no")
        .map(([rid, s]) => format(t.per_roast, { roast: shortRoast(PR[rid], lang), v: PD.VERDICT[lang][s.verdict] })).slice(0, 4);
      if (!lines.length) {
        const alt = rankBeans(mid, m.roast_best[0]).filter(([, s]) => s.verdict === "best").map(([x]) => x).slice(0, 4);
        lines = [PD.VERDICT[lang].no, format(t.r_bean_menu0, { bean: b[lang], menu: m[lang] }),
          format(t.closest, { roast: shortRoast(PR[ranked[0][0]], lang) })]
          .concat(reasons(ranked[0][0], mid, bid, lang).map((x) => "· " + x))
          .concat(alt.length ? [format(t.alt, { menu: m[lang], list: names(alt, "B", lang, 4) })] : []);
      }
      lines.push(format(t.why, { why: m[`why_${lang}`] }));
      return card(`${mid}+${bid}`, format(t.t_pair, { bean: b[lang], menu: m[lang] }), lines, [menuLabel(mid), beanLabel(bid), L.rule], lang);
    }
    function menusLines(bid, rid, lang) {
      const t = pT(lang), ranked = menusFor(bid, rid);
      const best = ranked.filter(([, s]) => s.verdict === "best").map(([x]) => x);
      const ok = ranked.filter(([, s]) => s.verdict === "ok").map(([x]) => x);
      const avoid = ranked.slice().reverse().filter(([, s]) => s.verdict === "no").map(([x]) => x);
      const out = [format(t.menus_best, { list: names(best, "M", lang, 10) })];
      if (ok.length) out.push(format(t.menus_ok, { list: names(ok, "M", lang, 5) }));
      if (avoid.length) out.push(format(t.menus_avoid, { list: names(avoid, "M", lang, 4) }));
      return out;
    }
    function cardBeanRoast(bid, rid, lang) {
      const t = pT(lang), b = PB[bid], r = PR[rid];
      let lines;
      if (rid === "green") lines = [t.green];
      else {
        const sb = b.roast_best.includes(rid) ? 2 : b.roast_ok.includes(rid) ? 1 : 0;
        lines = [format(t[`r_bean${sb}`], { bean: b[lang], list: roastList(b.roast_best, lang) })].concat(menusLines(bid, rid, lang));
      }
      return card(`${bid}+${rid}`, format(t.t_bean_roast, { bean: b[lang], roast: r[lang] }), lines, [beanLabel(bid), roastLabel(rid), L.rule], lang);
    }
    function profile(b, lang) {
      const t = pT(lang);
      const attrs = [...ATTRS, "complexity"].map((a) => `${PD.ATTR_NAME[lang][a]}${lang === "th" ? "" : " "}${PD.LEVEL[lang][b[a]]}`).join(t.sep);
      return format(t.profile, { kind: PD.KIND[lang][b.kind], attrs });
    }
    const IMG = PD ? PD.IMG || {} : {};
    const lookLine = (id, lang) => (IMG[id] && IMG[id][`look_${lang}`] ? [format(pT(lang).look, { look: IMG[id][`look_${lang}`] })] : []);
    function cardLook(kind, id, lang) {
      const it = IMG[id];
      if (!it || !it[`look_${lang}`]) return null;
      const t = pT(lang), x = kind === "menu" ? PM[id] : PB[id];
      const lines = [it[`look_${lang}`],
        it.file && it[`subject_${lang}`] ? format(t.photo, { subject: it[`subject_${lang}`] }) : format(t.no_photo, { reason: (it.reason || "—").split(" (")[0] }),
        kind === "menu" ? x[`recipe_${lang}`] : x[`note_${lang}`]];
      return card(`look:${id}`, format(t.t_look, { name: x[lang] }), lines, [kind === "menu" ? menuLabel(id) : beanLabel(id)], lang);
    }
    // รูปที่แนบกับคำตอบ (pairings.images_for)
    let labelId = null;
    function answerIds(question, cardObj, sources, limit = 3) {
      if (!PD) return [];
      let ids = [];
      const cid = (cardObj && cardObj.id) || "";
      if (cid.startsWith("pair:")) {
        const rest = cid.slice(5);
        if (rest.startsWith("flavor:")) {
          const fl = rest.slice(7);
          ids = ids.concat(PD.beans.filter((b) => b.flavors.includes(fl)).map((b) => b.id).slice(0, limit));
        } else ids = ids.concat((rest.startsWith("look:") ? rest.slice(5) : rest).split("+").filter((x) => PM[x] || PB[x]));
      } else if (!cardObj) {
        const f = pFind(question);
        ids = ids.concat(f.menu, f.bean);
      }
      if (!labelId) labelId = new Map([...PD.menus.map((m) => [menuLabel(m.id), m.id]), ...PD.beans.map((b) => [beanLabel(b.id), b.id])]);
      for (const sl of sources || []) if (labelId.has(sl)) ids.push(labelId.get(sl));
      return [...new Set(ids)];
    }
    // World Coffee Research สงวนลิขสิทธิ์รูป → ลิงก์ให้เปิดดูที่เว็บเจ้าของ (pairings.photo_links)
    function photoLinks(ids, limit = 2) {
      const out = [];
      for (const i of ids) {
        const b = PB[i];
        const url = b && b.sources.find((u) => u.startsWith("https://varieties.worldcoffeeresearch.org/"));
        if (url) out.push({ id: i, name_th: b.th, name_en: b.en, site: "World Coffee Research", url });
        if (out.length >= limit) break;
      }
      return out;
    }
    function imagesFor(question, cardObj, sources, limit = 3) {
      if (!PD || !Object.keys(IMG).length) return [];
      const out = [], seen = new Set();
      for (const i of answerIds(question, cardObj, sources, limit)) {
        const it = IMG[i];
        if (seen.has(i) || !it || !it.file) continue;
        seen.add(i);
        out.push({ id: i, kind: it.kind, file: it.file, width: it.width ?? null, height: it.height ?? null,
          subject_th: it.subject_th || "", subject_en: it.subject_en || "", credit: it.credit || "", license: it.license || "",
          license_url: it.license_url ?? null, source_page: it.source_page || "" });
        if (out.length >= limit) break;
      }
      return out;
    }
    function cardBean(bid, lang) {
      const t = pT(lang), b = PB[bid];
      const lines = [b[`note_${lang}`], ...lookLine(bid, lang), profile(b, lang), format(t.flavors, { list: b.flavors.join(", ") }),
        format(t.roasts_best, { list: roastList(b.roast_best, lang) })].concat(menusLines(bid, null, lang).slice(0, 2));
      return card(bid, format(t.t_bean, { bean: b[lang] }), lines, [beanLabel(bid), L.rule], lang);
    }
    function cardMenu(mid, lang) {
      const t = pT(lang), m = PM[mid];
      const rs = (ids) => roastList(ids, lang) || t.none;
      const lines = [m[`recipe_${lang}`], ...lookLine(mid, lang), format(t.roasts_best, { list: rs(m.roast_best) }), format(t.roasts_ok, { list: rs(m.roast_ok) })];
      for (const rid of m.roast_best.slice(0, 2)) {
        const [best] = beanLists(mid, rid);
        lines.push(format(t.per_roast, { roast: shortRoast(PR[rid], lang), v: names(best, "B", lang, 5) }));
      }
      lines.push(format(t.why, { why: m[`why_${lang}`] }));
      return card(mid, format(t.t_menu, { menu: m[lang] }), lines, [menuLabel(mid), L.rule], lang);
    }
    function cardRoast(rid, lang) {
      const t = pT(lang), r = PR[rid];
      const menus = PD.menus.filter((m) => m.roast_best.includes(rid)).map((m) => m.id);
      const beans = PD.beans.filter((b) => b.roast_best.includes(rid)).map((b) => b.id);
      const lines = [r[`note_${lang}`], format(t.menus_best, { list: names(menus, "M", lang, 10) }),
        format(t.best_beans, { list: names(beans, "B", lang, 10) })];
      return card(rid, format(t.t_roast, { roast: r[lang] }), lines, [roastLabel(rid), L.rule], lang);
    }
    function cardFlavor(flavor, cat, lang) {
      const t = pT(lang);
      const beans = PD.beans.filter((b) => b.flavors.includes(flavor)).map((b) => b.id);
      const lines = [format(t.best_beans, { list: names(beans, "B", lang, 10) })];
      for (const bid of beans.slice(0, 3)) {
        const b = PB[bid];
        lines.push(`${b[lang]}: ` + format(t.roasts_best, { list: roastList(b.roast_best, lang) }));
      }
      return card(`flavor:${flavor}`, format(t.t_flavor, { flavor }), lines, [L.flavor[cat]], lang);
    }
    const flavorOrder = Object.entries(D.flavor_cat).sort((a, b) => b[0].length - a[0].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([n, cat]) => [n, cat, new RegExp(`(?<![A-Za-z])${escapeRe(n)}(?![A-Za-z])`, "i")]);
    function pairAnswer(text, lang, stage) {
      if (!PD || !PD.T[lang] || PRX.block.test(text)) return null;
      const f = pFind(text);
      if (f.menu.length > 1 || f.roast.length > 1 || f.bean.length > 1) return null;
      const m = f.menu[0] || null, r = f.roast[0] || null, b = f.bean[0] || null;
      const wantBean = PRX.bean_q.test(text), wantRoast = PRX.roast_q.test(text);
      const wantMenu = PRX.menu_q.test(text), wantFit = PRX.fit_q.test(text);
      if (stage === "early") {
        if (PRX.look_q.test(text) && !r && !!m !== !!b) {
          const c = cardLook(m ? "menu" : "bean", m || b, lang);
          if (c) return c;
        }
        if (m && r && b) return cardTriple(m, r, b, lang);
        if (m && r) return cardMenuRoast(m, r, lang);
        if (m && b) return cardPair(m, b, lang);
        if (b && r && (wantMenu || wantFit)) return cardBeanRoast(b, r, lang);
        if (m && (wantBean || wantRoast)) return cardMenu(m, lang);
        if (b && !m && !r && (wantMenu || wantRoast)) return cardBean(b, lang);
        if (r && !m && !b && (wantMenu || wantBean)) return cardRoast(r, lang);
        return null;
      }
      if (b && !m && !r && (wantMenu || wantRoast || wantFit || PRX.flavor_q.test(text))) return cardBean(b, lang);
      if (!(m || r || b) && wantBean)
        for (const [n, cat, re] of flavorOrder)
          if (PD.good_flavors.includes(n) && re.test(text)) return cardFlavor(n, cat, lang);
      return null;
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
      const pair = pairAnswer(text, lang, "early");                    // คั่ว × เมนู × เมล็ด
      if (pair) return pair;
      const hits = matchTopics(text);
      if (hits.length !== 1) return hits.length ? null : pairAnswer(text, lang, "late");
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

    // ------------------------------------------------------------ hybrid RAG (retrieval.Retriever.hybrid_search + embeddings.fuse)
    // เวกเตอร์ฐานความรู้มาจาก data/kb_vectors.json แต่ย่อเป็น int8 (×127) ใน data.json ให้เว็บโหลดเร็ว → cos ต่างจาก Python ~0.01
    const VEC = (() => {
      const v = D.vectors;
      if (!v || !v.q) return null;
      const bin = typeof atob === "function" ? atob(v.q) : Buffer.from(v.q, "base64").toString("binary");
      const out = new Map();
      v.idx.forEach((ci, n) => {
        const a = new Float32Array(v.dim);
        for (let j = 0; j < v.dim; j++) { const b = bin.charCodeAt(n * v.dim + j); a[j] = (b > 127 ? b - 256 : b) / 127; }
        out.set(D.chunks[ci].label, a);
      });
      return out;
    })();
    const hasVectors = () => !!VEC;
    function fuse(bm, cos, k) {
      const score = new Map();
      for (const lst of [bm, cos]) lst.forEach(([label], i) => score.set(label, (score.get(label) || 0) + 1 / (D.vectors.rrf_k + i + 1)));
      const order = [...score.keys()];
      return order.map((lb, i) => [lb, score.get(lb), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, k)
        .map(([lb, sc]) => [lb, Math.round(sc * 1e6) / 1e6]);
    }
    // qv = เวกเตอร์ของคำถาม (ได้จาก Gemini/ตัวกลาง) · คืนรูปแบบเดียวกับ search() แต่ mode "hybrid" + cos
    function hybridSearch(query, qv, k = 5, pool = 10) {
      if (!VEC || !qv) return null;
      const bm = search(query, pool).map((h) => [h.source, h.score]);
      const cos = [...VEC].map(([lb, v]) => { let d = 0; for (let j = 0; j < v.length; j++) d += v[j] * qv[j]; return [lb, d]; })
        .sort((a, b) => b[1] - a[1]).slice(0, pool);
      const bmS = new Map(bm), cosS = new Map(cos), by = new Map(D.chunks.map((c) => [c.label, c]));
      return fuse(bm, cos, k).map(([lb]) => ({ source: lb, text: by.get(lb).text, score: bmS.get(lb) || 0,
        cos: Math.round((cosS.get(lb) || 0) * 1000) / 1000, mode: "hybrid" }));
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
      localPlan, formatPlan, localCheck, matchTopics, pairAnswer, imagesFor, answerIds, photoLinks, hybridSearch, hasVectors, fuse, data: D };
  }

  const api = { create, roundHalfEven, fmt0, fmt1 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CoffeeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
