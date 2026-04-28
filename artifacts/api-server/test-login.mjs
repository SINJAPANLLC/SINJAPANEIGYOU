const BASE = 'https://jmty.jp';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const EMAIL = 'sin_llc@icloud.com';
const PASS = 'Kazuya8008';

const { default: axios } = await import('axios');
const { load } = await import('cheerio');

function extractCookies(h) {
  const raw = h['set-cookie'];
  if (!raw) return '';
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(c => c.split(';')[0]).join('; ');
}
function merge(a, b) {
  const map = {};
  for (const p of (a+'; '+b).split(';')) { const [k,...vs]=p.trim().split('='); if(k) map[k.trim()]=vs.join('='); }
  return Object.entries(map).filter(([k])=>k).map(([k,v])=>`${k}=${v}`).join('; ');
}

async function run() {
  console.log('=== 個人アカウント(' + EMAIL + ')でログインテスト ===');

  const r1 = await axios.get(BASE+'/users/sign_in', {
    headers:{'User-Agent':UA,'Accept':'text/html,application/xhtml+xml'},
    maxRedirects:5
  });
  let cookies = extractCookies(r1.headers);
  const $1 = load(r1.data);
  const csrf = $1('input[name="authenticity_token"]').first().val();
  console.log('CSRF:', csrf ? '取得OK' : '❌ NOT FOUND');

  const r2 = await axios.post(BASE+'/users/sign_in',
    new URLSearchParams({ authenticity_token:csrf,'user[email]':EMAIL,'user[password]':PASS,commit:'ログイン' }).toString(),
    {
      headers:{'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded',Cookie:cookies,Referer:BASE+'/users/sign_in','Accept':'text/html,application/xhtml+xml'},
      maxRedirects:0,
      validateStatus:s=>s<400
    }
  );
  const nc = extractCookies(r2.headers);
  cookies = merge(cookies, nc);
  console.log('ログイン status:', r2.status, '| location:', r2.headers.location||'(none)');
  const keys = cookies.split(';').map(c=>c.trim().split('=')[0]).filter(Boolean);
  console.log('Cookies:', keys.join(', '));
  console.log('セッション有:', cookies.includes('_jmty_session') || cookies.includes('remember_user_token'));

  if (!cookies.includes('_jmty_session') && !cookies.includes('remember_user_token')) {
    const $2 = load(r2.data);
    const err = $2('[class*="alert"],[class*="notice"],[class*="error"],[class*="flash"]').first().text().trim().slice(0,300);
    console.log('❌ ログイン失敗:', err || r2.data.slice(0,200));
    return;
  }
  console.log('✅ ログイン成功！');

  console.log('\n=== GET /articles/new ===');
  const r3 = await axios.get(BASE+'/articles/new', {
    headers:{'User-Agent':UA,Cookie:cookies,'Accept':'text/html,application/xhtml+xml'},
    maxRedirects:5, validateStatus:s=>true
  });
  console.log('articles/new status:', r3.status);
  const $3 = load(r3.data);
  console.log('Page title:', $3('title').text().trim());
  const csrf2 = $3('input[name="authenticity_token"]').first().val();
  console.log('フォームCSRF:', csrf2 ? '取得OK' : '❌ NOT FOUND');

  if (r3.status !== 200 || !csrf2) {
    console.log('❌ 記事フォームにアクセスできません');
    const alert3 = $3('[class*="alert"],[class*="notice"],[class*="error"]').first().text().trim().slice(0,200);
    if (alert3) console.log('Alert:', alert3);
    return;
  }

  console.log('\n=== テスト投稿実行 ===');
  const nc3 = extractCookies(r3.headers);
  cookies = merge(cookies, nc3);

  const r4 = await axios.post(BASE+'/articles',
    new URLSearchParams({
      authenticity_token: csrf2,
      'article[title]': 'ビジネスパートナー・仲間募集しています',
      'article[body]': 'はじめまして。ビジネスに興味のある方、一緒に勉強会や交流会に参加できる仲間を探しています。業種問わず、向上心のある方を歓迎します。ジモティーのメッセージ機能でご連絡ください。',
      'article[kind]': 'neighbor',
      'article[area_code]': 'nagano-ken',
      commit: '投稿する',
    }).toString(),
    {
      headers:{'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded',Cookie:cookies,Referer:BASE+'/articles/new','Accept':'text/html,application/xhtml+xml'},
      maxRedirects:0,
      validateStatus:s=>s<500
    }
  );
  console.log('投稿 status:', r4.status);
  console.log('Location:', r4.headers.location||'(none)');
  if (r4.status === 302 && r4.headers.location) {
    const loc = r4.headers.location;
    console.log('✅ 投稿成功！URL:', loc.startsWith('http') ? loc : BASE+loc);
  } else {
    const $4 = load(r4.data);
    const err4 = $4('[class*="alert"],[class*="error"],[class*="notice"]').first().text().trim().slice(0,300);
    console.log('エラー:', err4 || r4.data.slice(0,300));
  }
}

run().catch(e => console.error('FATAL:', e.message, e.response?.status));
