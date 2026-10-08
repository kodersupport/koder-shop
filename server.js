/**
 * Koder Shop + Admin
 * Data persistence: GitHub Contents API (survives Render sleep/restart)
 * Fallback: local data/*.json when GITHUB_TOKEN is not set
 */
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'koder_admin_2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'koder_secret_change_me';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const USE_GITHUB = !!(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);

const DATA_DIR = path.join(__dirname, 'data');
const KEYS = ['products', 'coupons', 'notices', 'settings'];

// In-memory cache + SHA for GitHub updates
const cache = {};
const shas = {};

function localPath(key) {
  return path.join(DATA_DIR, key + '.json');
}

function readLocal(key) {
  try {
    return JSON.parse(fs.readFileSync(localPath(key), 'utf8'));
  } catch {
    return key === 'settings' ? {} : [];
  }
}

function writeLocal(key, data) {
  fs.writeFileSync(localPath(key), JSON.stringify(data, null, 2), 'utf8');
}

async function githubGet(key) {
  const filePath = 'data/' + key + '.json';
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'koder-shop'
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error('GitHub GET ' + key + ': ' + res.status + ' ' + t.slice(0, 200));
  }
  const json = await res.json();
  shas[key] = json.sha;
  const content = Buffer.from(json.content, 'base64').toString('utf8');
  return JSON.parse(content);
}

async function githubPut(key, data, message) {
  const filePath = 'data/' + key + '.json';
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const body = {
    message: message || `Update ${key}`,
    content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64'),
    branch: GITHUB_BRANCH
  };
  if (shas[key]) body.sha = shas[key];

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'koder-shop',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    // Retry once if SHA conflict
    if (res.status === 409 || res.status === 422) {
      await githubGet(key);
      body.sha = shas[key];
      const res2 = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'koder-shop',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!res2.ok) {
        const t = await res2.text();
        throw new Error('GitHub PUT retry ' + key + ': ' + res2.status + ' ' + t.slice(0, 200));
      }
      const j2 = await res2.json();
      shas[key] = j2.content && j2.content.sha;
      return;
    }
    const t = await res.text();
    throw new Error('GitHub PUT ' + key + ': ' + res.status + ' ' + t.slice(0, 200));
  }
  const j = await res.json();
  shas[key] = j.content && j.content.sha;
}

async function loadKey(key) {
  if (USE_GITHUB) {
    try {
      const data = await githubGet(key);
      if (data !== null) {
        cache[key] = data;
        return data;
      }
    } catch (e) {
      console.error('[load]', key, e.message);
    }
  }
  const local = readLocal(key);
  cache[key] = local;
  return local;
}

async function saveKey(key, data, message) {
  cache[key] = data;
  writeLocal(key, data); // always write local too
  if (USE_GITHUB) {
    await githubPut(key, data, message);
  }
}

async function getData(key) {
  if (cache[key] !== undefined) return cache[key];
  return loadKey(key);
}

async function initData() {
  console.log('Persistence:', USE_GITHUB ? 'GitHub (' + GITHUB_OWNER + '/' + GITHUB_REPO + ')' : 'LOCAL only (data will reset on restart)');
  for (const key of KEYS) {
    await loadKey(key);
    // Seed GitHub if file missing
    if (USE_GITHUB && shas[key] === undefined) {
      try {
        await githubPut(key, cache[key], 'Seed ' + key + '.json');
        console.log('Seeded GitHub:', key);
      } catch (e) {
        console.error('Seed failed', key, e.message);
      }
    }
  }
  console.log('Data loaded.');
}

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ---------- middleware ----------
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- PUBLIC API ----------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    persistence: USE_GITHUB ? 'github' : 'local',
    repo: USE_GITHUB ? GITHUB_OWNER + '/' + GITHUB_REPO : null
  });
});

app.get('/api/products', async (req, res) => {
  try {
    res.json(await getData('products'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/coupons', async (req, res) => {
  try {
    const now = new Date().toISOString().slice(0, 10);
    const list = (await getData('coupons'))
      .filter(c => c.active && (!c.expiresAt || c.expiresAt >= now) && (c.maxUses === 0 || c.used < c.maxUses))
      .map(c => ({ code: c.code, type: c.type, value: c.value, note: c.note || '' }));
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/coupons/validate', async (req, res) => {
  try {
    const code = String((req.body && req.body.code) || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Thiếu mã' });
    const coupons = await getData('coupons');
    const c = coupons.find(x => x.code.toUpperCase() === code);
    if (!c) return res.status(404).json({ error: 'Mã không tồn tại' });
    if (!c.active) return res.status(400).json({ error: 'Mã đã tắt' });
    const now = new Date().toISOString().slice(0, 10);
    if (c.expiresAt && c.expiresAt < now) return res.status(400).json({ error: 'Mã đã hết hạn' });
    if (c.maxUses > 0 && c.used >= c.maxUses) return res.status(400).json({ error: 'Mã đã hết lượt dùng' });
    res.json({ ok: true, code: c.code, type: c.type, value: c.value, note: c.note || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/notices', async (req, res) => {
  try {
    const list = (await getData('notices')).filter(n => n.active);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    res.json(await getData('settings'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- AUTH ----------
app.post('/api/admin/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true, persistence: USE_GITHUB ? 'github' : 'local' });
  }
  return res.status(401).json({ error: 'Sai mật khẩu' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.json({
    isAdmin: !!(req.session && req.session.isAdmin),
    persistence: USE_GITHUB ? 'github' : 'local'
  });
});

// ---------- ADMIN PRODUCTS ----------
app.get('/api/admin/products', requireAuth, async (req, res) => {
  res.json(await getData('products'));
});

app.put('/api/admin/products/:id/stock', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const durations = (req.body && req.body.durations) || [];
    const products = JSON.parse(JSON.stringify(await getData('products')));
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const map = {};
    durations.forEach(d => { map[d.label] = Number(d.stock); });
    products[idx].durations = products[idx].durations.map(d => ({
      ...d,
      stock: map[d.label] !== undefined ? map[d.label] : d.stock
    }));
    await saveKey('products', products, 'Update stock: ' + products[idx].name);
    res.json(products[idx]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const products = JSON.parse(JSON.stringify(await getData('products')));
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
    ['name', 'badge', 'platform', 'game', 'icon'].forEach(k => {
      if (body[k] !== undefined) products[idx][k] = body[k];
    });
    if (Array.isArray(body.durations)) products[idx].durations = body.durations;
    await saveKey('products', products, 'Update product: ' + products[idx].name);
    res.json(products[idx]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- ADMIN COUPONS ----------
app.get('/api/admin/coupons', requireAuth, async (req, res) => {
  res.json(await getData('coupons'));
});

app.post('/api/admin/coupons', requireAuth, async (req, res) => {
  try {
    const { code, type, value, maxUses, expiresAt, active, note } = req.body || {};
    if (!code || !type || value === undefined) return res.status(400).json({ error: 'Thiếu code/type/value' });
    if (!['percent', 'fixed'].includes(type)) return res.status(400).json({ error: 'type: percent hoặc fixed' });
    const coupons = JSON.parse(JSON.stringify(await getData('coupons')));
    const upper = String(code).trim().toUpperCase();
    if (coupons.some(c => c.code.toUpperCase() === upper)) return res.status(400).json({ error: 'Mã đã tồn tại' });
    const item = {
      id: 'c' + Date.now(),
      code: upper,
      type,
      value: Number(value),
      maxUses: Number(maxUses) || 0,
      used: 0,
      expiresAt: expiresAt || '',
      active: active !== false,
      note: note || ''
    };
    coupons.push(item);
    await saveKey('coupons', coupons, 'Create coupon: ' + upper);
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/coupons/:id', requireAuth, async (req, res) => {
  try {
    const coupons = JSON.parse(JSON.stringify(await getData('coupons')));
    const idx = coupons.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy mã' });
    const b = req.body || {};
    if (b.code !== undefined) coupons[idx].code = String(b.code).trim().toUpperCase();
    if (b.type !== undefined) coupons[idx].type = b.type;
    if (b.value !== undefined) coupons[idx].value = Number(b.value);
    if (b.maxUses !== undefined) coupons[idx].maxUses = Number(b.maxUses);
    if (b.used !== undefined) coupons[idx].used = Number(b.used);
    if (b.expiresAt !== undefined) coupons[idx].expiresAt = b.expiresAt;
    if (b.active !== undefined) coupons[idx].active = !!b.active;
    if (b.note !== undefined) coupons[idx].note = b.note;
    await saveKey('coupons', coupons, 'Update coupon: ' + coupons[idx].code);
    res.json(coupons[idx]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/coupons/:id', requireAuth, async (req, res) => {
  try {
    let coupons = await getData('coupons');
    const before = coupons.length;
    coupons = coupons.filter(c => c.id !== req.params.id);
    if (coupons.length === before) return res.status(404).json({ error: 'Không tìm thấy' });
    await saveKey('coupons', coupons, 'Delete coupon');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- ADMIN NOTICES ----------
app.get('/api/admin/notices', requireAuth, async (req, res) => {
  res.json(await getData('notices'));
});

app.post('/api/admin/notices', requireAuth, async (req, res) => {
  try {
    const { title, content, type, active } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: 'Thiếu title/content' });
    const notices = JSON.parse(JSON.stringify(await getData('notices')));
    const item = {
      id: 'n' + Date.now(),
      title,
      content,
      type: type || 'info',
      active: active !== false,
      createdAt: new Date().toISOString().slice(0, 10)
    };
    notices.unshift(item);
    await saveKey('notices', notices, 'Create notice: ' + title);
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/notices/:id', requireAuth, async (req, res) => {
  try {
    const notices = JSON.parse(JSON.stringify(await getData('notices')));
    const idx = notices.findIndex(n => n.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
    const b = req.body || {};
    if (b.title !== undefined) notices[idx].title = b.title;
    if (b.content !== undefined) notices[idx].content = b.content;
    if (b.type !== undefined) notices[idx].type = b.type;
    if (b.active !== undefined) notices[idx].active = !!b.active;
    await saveKey('notices', notices, 'Update notice');
    res.json(notices[idx]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/notices/:id', requireAuth, async (req, res) => {
  try {
    let notices = await getData('notices');
    const before = notices.length;
    notices = notices.filter(n => n.id !== req.params.id);
    if (notices.length === before) return res.status(404).json({ error: 'Không tìm thấy' });
    await saveKey('notices', notices, 'Delete notice');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- ADMIN SETTINGS ----------
app.get('/api/admin/settings', requireAuth, async (req, res) => {
  res.json(await getData('settings'));
});

app.put('/api/admin/settings', requireAuth, async (req, res) => {
  try {
    const current = await getData('settings');
    const next = { ...current, ...(req.body || {}) };
    await saveKey('settings', next, 'Update settings');
    res.json(next);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- STATS ----------
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  const products = await getData('products');
  const coupons = await getData('coupons');
  const notices = await getData('notices');
  let totalStock = 0, outOfStock = 0, lowStock = 0;
  products.forEach(p => {
    (p.durations || []).forEach(d => {
      const s = Number(d.stock) || 0;
      totalStock += s;
      if (s === 0) outOfStock++;
      else if (s <= 3) lowStock++;
    });
  });
  res.json({
    productCount: products.length,
    totalStock,
    outOfStock,
    lowStock,
    couponCount: coupons.length,
    activeCoupons: coupons.filter(c => c.active).length,
    noticeCount: notices.length,
    activeNotices: notices.filter(n => n.active).length,
    persistence: USE_GITHUB ? 'github' : 'local'
  });
});

// Reload from GitHub (admin)
app.post('/api/admin/reload', requireAuth, async (req, res) => {
  try {
    for (const key of KEYS) {
      delete cache[key];
      await loadKey(key);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

initData().then(() => {
  app.listen(PORT, () => {
    console.log('Koder Shop on port', PORT);
    console.log('Shop:  http://localhost:' + PORT + '/');
    console.log('Admin: http://localhost:' + PORT + '/admin');
  });
}).catch(err => {
  console.error('Init failed', err);
  process.exit(1);
});
