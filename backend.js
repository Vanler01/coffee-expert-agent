// "หลังบ้าน" ของเว็บเวอร์ชัน — แทน server.py ทั้งตัวในเบราว์เซอร์
// หน้าเว็บ (ui/index.html ตัวเดียวกับแอปคอม) เรียก fetch("/api/...") เหมือนเดิม → ไฟล์นี้ดักไว้แล้วตอบเอง
// ตรรกะแปลจาก server.py (Session.chat), agent.py (โหมดประหยัด), quota.py, answer_cache.py
// แยกเป็น create({...}) ที่ไม่ผูกกับเบราว์เซอร์ → เทสต์ใน node ได้ (web/test_backend.mjs)
(function (root) {
  "use strict";
  const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";

  // proxyUrl = ตัวกลาง Cloudflare Worker (web/worker) ที่เก็บคีย์ไว้ฝั่งเซิร์ฟเวอร์ — เว็บไม่มีคีย์เลย
  // ผู้ใช้ใส่คีย์ของตัวเองในหน้าตั้งค่าได้ → ใช้คีย์นั้นเรียก Google ตรง (ไม่ผ่านตัวกลาง)
  function create({ D, E, fetchFn, store, now = () => Date.now(), bundledKey = "", proxyUrl = "" }) {
    const S = {
      lang: "th", testMode: false, stm: [], model: D.model_chain[0],
      get: (k, d) => { try { const v = store.getItem("cea." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
      set: (k, v) => { try { store.setItem("cea." + k, JSON.stringify(v)); } catch { /* เต็ม/ถูกบล็อก ก็ใช้ต่อได้ */ } },
    };
    // ข้อมูลเปลี่ยน (deploy ใหม่) → ล้าง cache คำตอบเก่าในเครื่องผู้ใช้
    if (S.get("kb", "") !== D.kb_hash) { S.set("cache", {}); S.set("kb", D.kb_hash); }
    const userKey = () => S.get("key", "");
    const key = () => userKey() || bundledKey;
    const viaProxy = () => !userKey() && !!proxyUrl;
    const canAsk = () => viaProxy() || !!key();
    // ตัวนับรวมของทุกคนจากตัวกลาง (GET /v1/quota) — ใช้แทนตัวนับในเครื่องเมื่อถามผ่านตัวกลาง
    let shared = null, sharedSkew = 0;
    async function refreshShared() {
      if (!viaProxy()) return;
      try {
        const r = await fetchFn(`${proxyUrl}/v1/quota`);
        if (r.ok) { shared = await r.json(); sharedSkew = (shared.now || now()) - now(); }
      } catch { /* ออฟไลน์ ก็ใช้ค่าล่าสุดที่มี */ }
    }
    const langName = () => D.languages[S.lang] || D.languages.th;

    // ------------------------------------------------------------ โควตา (quota.py) — นับเฉพาะเครื่องนี้
    const DAILY = 20, PER_Q = 1.5;
    const today = () => { const d = new Date(now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    function Q() {
      let q = S.get("quota", null);
      if (!q || q.day !== today()) q = { day: today(), used: {}, limit: Object.assign({}, (q && q.limit) || {}), cool: {}, questions: 0, calls: 0 };
      if (viaProxy() && shared) {        // ใช้ตัวเลขรวมทุกคน · cool เป็นเวลาของเครื่องตัวกลาง → ปรับเวลาให้ตรงเครื่องนี้
        const cool = {};
        for (const [m, t] of Object.entries(shared.cool || {})) cool[m] = t - sharedSkew;
        return Object.assign({}, q, { used: shared.used || {}, limit: Object.assign({}, q.limit, shared.limit || {}), cool });
      }
      return q;
    }
    const saveQ = (q) => { if (!(viaProxy() && shared)) S.set("quota", q); else { const l = S.get("quota", null) || q; l.questions = q.questions; l.calls = q.calls; l.day = today(); S.set("quota", l); } };
    const coolLeft = (q, m) => Math.max(0, Math.floor(((q.cool[m] || 0) - now()) / 1000));
    const available = (m) => { const q = Q(); return coolLeft(q, m) === 0 && (q.used[m] || 0) < (q.limit[m] || DAILY); };
    function recordCalls(m, n) { if (n > 0) { const q = Q(); q.used[m] = (q.used[m] || 0) + n; saveQ(q); } }
    function recordQuestion(n) { const q = Q(); q.questions += 1; q.calls += Math.max(n, 1); saveQ(q); }
    function recordRate(m, retry, value, perDay) {
      const q = Q();
      if (value) { q.limit[m] = value; if (perDay) q.used[m] = Math.max(q.used[m] || 0, value); }
      if (retry) q.cool[m] = now() + retry * 1000;
      saveQ(q);
    }
    function clearCool(m) { const q = Q(); delete q.cool[m]; saveQ(q); }
    function secondsToPacificMidnight() { const t = now() / 1000 - 8 * 3600; return Math.floor(86400 - (((t % 86400) + 86400) % 86400)); }
    function snapshot() {
      const q = Q();
      const models = D.model_chain.map((m) => {
        const lim = q.limit[m] || DAILY, used = q.used[m] || 0;
        return { model: m, used, limit: lim, calls_left: Math.max(lim - used, 0), cooldown_seconds: coolLeft(q, m) };
      });
      const callsLeft = models.reduce((a, m) => a + m.calls_left, 0);
      const perQ = q.questions >= 2 ? Math.max(q.calls / q.questions, 1) : PER_Q;
      const status = models.some((m) => m.calls_left > 0 && m.cooldown_seconds === 0) ? "ok" : callsLeft > 0 ? "cooldown" : "exhausted";
      const waits = models.filter((m) => m.cooldown_seconds > 0 && m.calls_left > 0).map((m) => m.cooldown_seconds);
      return { status, models, questions_left: Math.floor(callsLeft / perQ), calls_left: callsLeft,
        calls_per_question: Math.round(perQ * 10) / 10, questions_asked: q.questions,
        wait_seconds: waits.length ? Math.min(...waits) : 0, seconds_to_reset: secondsToPacificMidnight(),
        per_device: !(viaProxy() && shared) };
    }

    // ------------------------------------------------------------ cache (answer_cache.py)
    const keyOf = (q) => `${S.lang}|${E.normalize(q)}`;
    function cacheGet(q) { return S.get("cache", {})[keyOf(q)] || null; }
    function cachePut(q, answer, sources, model) {
      if (!E.normalize(q) || !answer.trim()) return;
      const c = S.get("cache", {});
      c[keyOf(q)] = { question: q.trim(), answer, sources, model, at: Math.floor(now() / 1000) };
      const keys = Object.keys(c);
      if (keys.length > D.cache_max) keys.sort((a, b) => c[a].at - c[b].at).slice(0, keys.length - D.cache_max).forEach((k) => delete c[k]);
      S.set("cache", c);
    }
    function similar(q, entries) {
      const want = JSON.stringify(E.anchors(q));
      let best = null;
      for (const [k, e] of Object.entries(entries)) {
        const [lang, ...rest] = k.split("|");
        if (lang !== S.lang) continue;
        const prev = e.question || rest.join("|");
        const s = E.similarity(q, prev);
        if (s >= D.similar && JSON.stringify(E.anchors(prev)) === want && (!best || s > best[0])) best = [s, e];
      }
      return best;
    }

    // ------------------------------------------------------------ Gemini (REST โดยตรงจากเบราว์เซอร์)
    class ApiError extends Error { constructor(type, msg, extra = {}) { super(msg); Object.assign(this, { type }, extra); } }
    let requests = 0;
    async function gemini(model, system, contents) {
      requests += 1;
      let res;
      try {
        const proxy = viaProxy();
        res = await fetchFn(proxy ? `${proxyUrl}/v1/generate/${encodeURIComponent(model)}` : `${GEMINI}${encodeURIComponent(model)}:generateContent`, {
          method: "POST", headers: proxy ? { "Content-Type": "application/json" } : { "Content-Type": "application/json", "x-goog-api-key": key() },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents,
            tools: [{ functionDeclarations: [{ name: "search_domain", description: D.tool.description,
              parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } }] }] }),
        });
      } catch (e) { throw new ApiError("connection", String(e && e.message || e)); }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = body.error || {}, msg = err.message || `HTTP ${res.status}`;
        if (String(err.status || "").startsWith("CEA_")) throw new ApiError("proxy", msg);   // ข้อความจากตัวกลาง (เพดาน IP ฯลฯ) — ไม่สลับรุ่น
        if (res.status === 429) {
          let retry = null, value = null, perDay = false;
          for (const d of err.details || []) {
            if (String(d["@type"]).endsWith("RetryInfo") && d.retryDelay) retry = parseFloat(d.retryDelay);
            if (String(d["@type"]).endsWith("QuotaFailure")) for (const v of d.violations || []) {
              if (String(v.quotaId || "").includes("PerDay")) perDay = true;
              if (v.quotaValue) value = parseInt(v.quotaValue, 10);
            }
          }
          throw new ApiError("rate", msg, { retry, value, perDay });
        }
        if ([500, 502, 503, 504, 404].includes(res.status)) throw new ApiError("overloaded", msg);
        if (res.status === 400 && /api key/i.test(msg) || res.status === 401 || res.status === 403)
          throw new ApiError("auth", /referer|referrer/i.test(msg)
            ? "คีย์นี้ถูกล็อกให้ใช้ได้เฉพาะเว็บไซต์ที่กำหนด — ใช้คีย์ของตัวเองได้ที่ ตั้งค่า ⚙️"
            : "API key ใช้ไม่ได้ — ตรวจหรือใส่คีย์ใหม่ที่ ตั้งค่า ⚙️");
        throw new ApiError("other", `Gemini ตอบกลับผิดพลาด: ${msg}`);
      }
      const cand = (body.candidates || [])[0];
      if (!cand || cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT")
        throw new ApiError("refusal", (body.promptFeedback && body.promptFeedback.blockReason) || (cand && cand.finishReason) || "ไม่มีคำตอบ");
      const parts = (cand.content && cand.content.parts) || [];
      return { content: cand.content || { role: "model", parts: [] },
        text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim(),
        calls: parts.filter((p) => p.functionCall).map((p) => p.functionCall) };
    }

    // ------------------------------------------------------------ hybrid RAG: แปลงคำถามเป็นเวกเตอร์ (embeddings.QueryEmbedder)
    // 1 ครั้ง/คำถามที่ไปถึง AI · ผ่านตัวกลาง (/v1/embed) หรือคีย์ของผู้ใช้ · พลาด = พัก 60 วิ แล้วใช้ BM25 อย่างเดียว
    const EMBED_MODEL = D.vectors ? D.vectors.model : "";
    const qmemo = new Map();
    let embedPauseUntil = 0, embedCalls = 0;
    async function embedQuery(text) {
      if (!E.hasVectors() || S.testMode) return null;
      if (qmemo.has(text)) return qmemo.get(text);
      if (now() < embedPauseUntil || !canAsk()) return null;
      const proxy = viaProxy();
      try {
        embedCalls += 1;
        const res = await fetchFn(proxy ? `${proxyUrl}/v1/embed` : `${GEMINI}${EMBED_MODEL}:batchEmbedContents`, {
          method: "POST", headers: proxy ? { "Content-Type": "application/json" } : { "Content-Type": "application/json", "x-goog-api-key": key() },
          body: JSON.stringify({ requests: [{ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] },
            taskType: "RETRIEVAL_QUERY", outputDimensionality: D.vectors.dim }] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const v = (await res.json()).embeddings[0].values;
        const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
        const qv = v.map((x) => x / n);
        if (qmemo.size > 64) qmemo.clear();
        qmemo.set(text, qv);
        return qv;
      } catch {
        embedPauseUntil = now() + 60_000;
        return null;
      }
    }
    // ค้นฐานความรู้: hybrid ถ้าได้เวกเตอร์คำถาม ไม่งั้น BM25 (เหมือน Retriever.search)
    async function searchKb(query, k = 5) {
      const qv = await embedQuery(query);
      return (qv && E.hybridSearch(query, qv, k)) || E.search(query, k);
    }

    // ------------------------------------------------------------ agent โหมดประหยัด (agent.py lean)
    async function prefetch(question, sources, trace) {
      const hits = await searchKb(E.expandQuery(question), 5);
      for (const h of hits.slice(0, 3)) if (!sources.includes(h.source)) sources.push(h.source);
      trace("action", `search_domain (ค้นล่วงหน้าในเครื่อง${hits.length && hits[0].mode === "hybrid" ? " · hybrid" : ""}) → ${sources.length} หัวข้อ`);
      if (!hits.length) {
        trace("action", "ค้นล่วงหน้าไม่เจอ → ให้โมเดลค้นเองเป็นภาษาไทย");
        return "<knowledge>\n(no matching passage found — call search_domain with Thai keywords before answering)\n</knowledge>";
      }
      const blocks = hits.slice(0, 4).map((h, i) => `[${i + 1}] ${h.source}\n${h.text}`);
      if (Math.max(...hits.map((h) => h.score)) < D.bm25.weak_match) {
        trace("action", "ผลค้นล่วงหน้าตรงน้อย → ให้โมเดลค้นเพิ่มเป็นภาษาไทย");
        return "<knowledge>\n(weak match — these passages may not answer the question. Call search_domain with Thai keywords before answering.)\n\n" + blocks.join("\n\n") + "\n</knowledge>";
      }
      return "<knowledge>\n" + blocks.join("\n\n") + "\n</knowledge>";
    }

    async function runAgent(question, model, trace) {
      const sources = [], toolLog = [];
      trace("perception", "input: text");
      trace("organize", "recalled 0 memory item(s), 0 lesson(s)");
      const evidence = await prefetch(question, sources, trace);
      const plan = E.localPlan(question, sources, langName());
      trace("planning", `(วางแผนในเครื่อง) ${plan.subgoals.length} subgoal(s)`);
      const d = new Date(now());
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const context = `<context>\nToday is ${iso} (${d.toLocaleDateString("en-US", { weekday: "long" })}).\n</context>\n${evidence}`;
      const contents = [];
      for (const [u, a] of S.stm) contents.push({ role: "user", parts: [{ text: u }] }, { role: "model", parts: [{ text: a }] });
      contents.push({ role: "user", parts: [{ text: context }, { text: question }, { text: `<plan>\n${E.formatPlan(plan)}\n</plan>` }] });
      const system = D.prompts[S.lang] || D.prompts.th;

      async function act() {
        for (let turn = 0; turn < D.max_tool_turns; turn++) {
          const r = await gemini(model, system, contents);
          contents.push(r.content);
          if (!r.calls.length) return r.text;
          const responses = [];
          for (const call of r.calls) {
            const q = (call.args && call.args.query) || "";
            trace("action", `search_domain(${JSON.stringify({ query: q })})`);
            const hits = call.name === "search_domain" ? await searchKb(E.expandQuery(q), 5) : [];
            for (const h of hits.slice(0, 3)) if (!sources.includes(h.source)) sources.push(h.source);
            const content = hits.length ? JSON.stringify(hits) : "ไม่พบข้อมูลที่เกี่ยวข้องในฐานความรู้";
            toolLog.push(`search_domain(${JSON.stringify({ query: q })}) -> ${content.slice(0, 1500)}`);
            responses.push({ functionResponse: { name: call.name, response: { result: content } } });
          }
          contents.push({ role: "user", parts: responses });
        }
        throw new ApiError("other", `stopped after ${D.max_tool_turns} tool turns without a final answer`);
      }

      let answer = await act();
      for (let attempt = 0; attempt <= D.max_revisions; attempt++) {
        const review = E.localCheck(question, answer, evidence + toolLog.join("\n"), langName());
        trace("reflection", "(ตรวจในเครื่อง) " + (review.approved ? "approved" : review.issues.join("; ")));
        if (review.approved || attempt === D.max_revisions) break;
        contents.push({ role: "user", parts: [{ text: "[Self-critique] Revise your answer to fix these issues:\n" + review.issues.map((i) => `- ${i}`).join("\n") }] });
        answer = await act();
      }
      trace("output", `done (gemini:${model})`);
      return { answer, sources: sources.slice(0, 4) };
    }

    async function mockAnswer(question, trace) {
      const sources = [];
      trace("perception", "input: text");
      const ev = await prefetch(question, sources, trace);
      trace("planning", "(วางแผนในเครื่อง) 3 subgoal(s)");
      const body = ev.split("<knowledge>")[1].split("</knowledge>")[0].trim();
      const lines = body.split("\n\n").filter((b) => /^\[\d+\]/.test(b)).slice(0, 2).map((b) => {
        const nl = b.indexOf("\n"), head = b.slice(0, nl);
        let text = b.slice(nl + 1); if (text.includes("\n")) text = text.slice(text.indexOf("\n") + 1);
        return `- **${head.split("§ ").slice(1).join("§ ") || head}** — ${text.slice(0, 220)}${text.length > 220 ? "…" : ""}`;
      });
      trace("reflection", "(ตรวจในเครื่อง) approved");
      trace("output", "done (test:mock)");
      return { answer: D.mock_prefix + "\n" + (lines.length ? lines : ["- (ไม่พบข้อมูลที่เกี่ยวข้องในฐานความรู้)"]).join("\n"), sources: sources.slice(0, 4) };
    }

    // ------------------------------------------------------------ เหมือน Session.chat ของ server.py
    function remember(q, a) { S.stm.push([q, a]); S.stm = S.stm.slice(-D.short_term_turns); }
    function makeTrace() {
      const events = [];
      const fn = (step, message) => events.push({ step, label: D.step_labels[step] || step, message });
      fn.events = events;
      return fn;
    }

    async function chat(message, forceAi) {
      const trace = makeTrace();
      if (!forceAi) {
        const card = E.answer(message, S.lang);
        if (card) { remember(message, E.asText(card)); return { kind: card.kind, card, quota: snapshot() }; }
      }
      if (S.testMode) {
        const r = await mockAnswer(message, trace);
        return { kind: "test", answer: r.answer, sources: r.sources, trace: trace.events, model: "mock", quota: snapshot() };
      }
      const fresh = S.stm.length === 0;
      if (!forceAi) {
        let hit = D.seeds[keyOf(message)] ? [1, D.seeds[keyOf(message)]] : null, how = "seed";
        if (!hit && fresh && cacheGet(message)) { hit = [1, cacheGet(message)]; how = "exact"; }
        if (!hit && fresh) {
          const near = [similar(message, S.get("cache", {})), similar(message, D.seeds)].filter(Boolean).sort((a, b) => b[0] - a[0])[0];
          if (near) { hit = near; how = "similar"; }
        }
        if (hit) {
          const e = hit[1];
          remember(message, e.answer);
          return { kind: "cache", how, answer: e.answer, sources: e.sources || [], model: e.model || "",
            cached_at: e.at || 0, asked: e.question || "", quota: snapshot() };
        }
      }
      if (!canAsk()) return { error: "ยังไม่มี API key ของ Gemini — ใส่คีย์ได้ที่ ตั้งค่า ⚙️ (ขอฟรีที่ aistudio.google.com) · คำถามที่ตอบในเครื่องยังใช้ได้", need_key: true, trace: trace.events };

      await refreshShared();                                // รู้ก่อนว่ารุ่นไหนคนอื่นใช้โควตาหมดแล้ว
      const base = [S.model].concat(D.model_chain.filter((m) => m !== S.model));
      const chain = base.filter(available).length ? base.filter(available) : base;
      const tried = [], exhausted = [];
      let total = 0;
      for (const model of chain) {
        tried.push(model);
        const before = requests;
        try {
          const r = await runAgent(message, model, trace);
          const calls = requests - before; total += calls;
          recordCalls(model, calls); recordQuestion(total); clearCool(model);
          S.model = model;
          if (fresh) cachePut(message, r.answer, r.sources, model);
          await refreshShared();
          remember(message, r.answer);
          const out = { kind: "ai", answer: r.answer, sources: r.sources, calls: total, trace: trace.events, model, quota: snapshot() };
          if (tried.length > 1) out.notice = `รุ่นแรกไม่ว่าง เปลี่ยนไปใช้ ${model} ให้อัตโนมัติ`;
          return out;
        } catch (e) {
          const calls = requests - before; total += calls; recordCalls(model, calls);
          if (e.type === "overloaded") { recordRate(model, D.overload_pause, null, false); trace("fallback", `${model} คนใช้แน่น ลองรุ่นถัดไป`); continue; }
          if (e.type === "rate") { recordRate(model, e.retry, e.value, e.perDay); exhausted.push(model); trace("fallback", `${model} โควตาหมด ลองรุ่นถัดไป`); continue; }
          if (e.type === "auth") return { error: e.message, need_key: true, trace: trace.events };
          if (e.type === "proxy") return { error: e.message, trace: trace.events, quota: snapshot() };
          if (e.type === "connection") return { error: `เชื่อมต่อไม่ได้: ${e.message} — ตรวจว่าเครื่องต่ออินเทอร์เน็ตอยู่`, trace: trace.events };
          if (e.type === "refusal") return { error: `โมเดลปฏิเสธคำขอนี้: ${e.message}`, trace: trace.events };
          return { error: e.message || String(e), trace: trace.events };
        }
      }
      const detail = exhausted.length
        ? `โควตาฟรีของทุกรุ่นหมดชั่วคราว (รุ่นที่โควตาหมด: ${exhausted.join(", ")})\n\nรอสัก 1-2 นาทีแล้วถามใหม่ หรือถ้ายังไม่หาย แปลว่าโควตาต่อวันหมด ให้รอวันถัดไป หรือใส่คีย์ของตัวเองที่ ตั้งค่า ⚙️`
        : `ตอนนี้โมเดลฟรีของ Gemini มีคนใช้เยอะทุกรุ่น (ลองแล้ว ${tried.join(", ")}) รอสัก 1-2 นาทีแล้วถามใหม่อีกครั้ง`;
      return { error: detail, trace: trace.events, quota: snapshot() };
    }

    // ------------------------------------------------------------ API แบบเดียวกับ server.py
    async function handle(path, body, params) {
      switch (path) {
        case "status": await refreshShared(); return { has_key: S.testMode || canAsk(), provider: "gemini", model: S.model, domain: "coffee",
          chunks: D.chunks.length, mode: "bm25", error: "", lang: S.lang, languages: D.languages, quota: snapshot(),
          quick_topics: D.topics.length, cached_answers: Object.keys(S.get("cache", {})).length,
          seeded_answers: Object.keys(D.seeds).length, test_mode: S.testMode, full_ai: false, version: `${D.version} (${D.version_date})` };
        case "quota": await refreshShared(); return snapshot();
        case "chat": {
          const m = String(body.message || "").trim();
          if (!m) return { error: "ยังไม่ได้พิมพ์คำถาม" };
          if (m.length > 4000) return { error: "คำถามยาวเกิน 4,000 ตัวอักษร" };
          return chat(m, !!body.force_ai);
        }
        case "lang": if (!D.languages[body.lang]) return { error: `ไม่รองรับภาษา '${body.lang}'` };
          if (body.lang !== S.lang) { S.lang = body.lang; S.stm = []; } return { ok: true, lang: S.lang };
        case "reset": S.stm = []; return { ok: true };
        case "testmode": S.testMode = !!body.on; return { ok: true, test_mode: S.testMode };
        case "fullai": return { ok: true, full_ai: false };     // เว็บใช้โหมดประหยัดอย่างเดียว
        case "key": {
          const k = String(body.key || "").trim();
          if (!k) return { error: "ยังไม่ได้ใส่คีย์" };
          if (!/^[\x21-\x7e]+$/.test(k)) return { error: "คีย์ไม่ถูกต้อง — ต้องเป็นตัวอักษรอังกฤษและตัวเลขเท่านั้น ไม่มีช่องว่าง" };
          S.set("key", k); return { ok: true };
        }
        case "source": {
          const label = params.get("label") || "";
          const c = D.chunks.find((x) => x.label === label);
          return c ? { label, text: c.text } : { error: "ไม่พบหัวข้อนี้ในฐานความรู้" };
        }
        default: return { error: "not found" };
      }
    }
    return { handle, chat, snapshot, state: S, stats: () => ({ requests, embedCalls }) };
  }

  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CoffeeBackend = api;

  // ------------------------------------------------------------ ต่อเข้ากับหน้าเว็บ (เฉพาะในเบราว์เซอร์)
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const realFetch = window.fetch.bind(window);
  // ไม่มีคีย์ในเว็บแล้ว (คีย์ที่ฝังในเว็บสาธารณะถูก Google ลบอัตโนมัติ) — ถามผ่านตัวกลาง window.CEA_PROXY (cfg.js)
  const proxyUrl = String(window.CEA_PROXY || "").replace(/\/+$/, "");
  const bundledKey = "";
  const ready = realFetch("data.json", { cache: "no-cache" }).then((r) => r.json()).then((D) => {
    const E = root.CoffeeEngine.create(D);
    return { D, B: create({ D, E, fetchFn: realFetch, store: window.localStorage, bundledKey, proxyUrl }) };
  });
  const json = (obj) => new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } });
  window.fetch = async function (input, init) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin === location.origin) {
      const p = url.pathname;
      if (p.endsWith("/flavors.json")) { const { D } = await ready; return json(D.flavors); }
      const i = p.indexOf("/api/");
      if (i >= 0) {
        const { B } = await ready;
        let body = {};
        try { body = init && init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
        return json(await B.handle(p.slice(i + 5), body, url.searchParams));
      }
    }
    return realFetch(input, init);
  };

  // ปรับหน้าเว็บเล็กน้อยสำหรับเว็บเวอร์ชัน (ไม่แตะไฟล์ index.html ของแอปคอม)
  // ตัวนับ: ผ่านตัวกลาง = รวมทุกคน (realtime) · ใช้คีย์ตัวเอง = นับเฉพาะเครื่องนี้ (มี *)
  const NOTE = {
    shared: { th: "รวมทุกคนที่ใช้เว็บนี้วันนี้ (นับที่ตัวกลาง แบบ realtime)", en: "Shared by everyone using this site today (counted at the proxy, real time)" },
    device: { th: "นับเฉพาะเครื่องนี้ (ใช้คีย์ของตัวเอง)", en: "Counted on this device only (your own key)" },
  };
  const isShared = () => { try { return !!proxyUrl && !localStorage.getItem("cea.key"); } catch { return !!proxyUrl; } };
  if (window.I18N) for (const [code, T] of Object.entries(window.I18N)) {
    const orig = T.quotaTipLeft, o = T.quotaLeft;
    if (typeof orig === "function") T.quotaTipLeft = (...a) => {
      const n = NOTE[isShared() ? "shared" : "device"];
      return `${orig(...a)} · ${n[code] || n.en}`;
    };
    if (typeof o === "function") T.quotaLeft = (n) => `${o(n)}${isShared() ? "" : "*"}`;
  }
  document.addEventListener("DOMContentLoaded", () => {
    for (const id of ["fullAi", "fullAiNote"]) {          // โหมด AI เต็มรูปแบบมีเฉพาะแอปคอม
      const el = document.getElementById(id);
      if (el) (el.closest("label") || el).style.display = "none";
    }
    const status = document.getElementById("status");      // ลิงก์อธิบายวิธีสร้าง/การทำงาน ในหน้าตั้งค่า (เฉพาะเว็บ)
    if (status && !document.getElementById("howLink")) {
      const a = document.createElement("a");
      a.id = "howLink"; a.href = "how-it-works.txt"; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "📄 วิธีสร้างและการทำงาน · How it works";
      a.style.cssText = "display:block;font-size:13px;margin:-6px 0 14px";
      status.insertAdjacentElement("afterend", a);
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
