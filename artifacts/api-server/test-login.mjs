const BASE = 'https://jmty.jp';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const EMAIL = process.env.JIMOTY_EMAIL;
const PASS = process.env.JIMOTY_PASSWORD;

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
  console.log('Step1: GET /users/sign_in');
  const r1 = await axios.get(BASE+'/users/sign_in', {
    headers:{'User-Agent':UA,'Accept':'text/html,application/xhtml+xml'},
    maxRedirects:5
  });
  let cookies = extractCookies(r1.headers);
  const $1 = load(r1.data);
  const csrf = $1('input[name="authenticity_token"]').first().val();
  console.log('csrf:', csrf ? csrf.slice(0,20)+'...' : '❌ NOT FOUND');
  console.log('cookies:', cookies.split(';').map(c=>c.trim().split('=')[0]).join(', '));

  console.log('\nStep2: POST login');
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
  console.log('login status:', r2.status, '| location:', r2.headers.location||'(none)');
  const keys = cookies.split(';').map(c=>c.trim().split('=')[0]).filter(Boolean);
  console.log('cookie keys:', keys.join(', '));
  console.log('has _jmty_session:', cookies.includes('_jmty_session'));
  console.log('has remember_user_token:', cookies.includes('remember_user_token'));

  if (!cookies.includes('_jmty_session') && !cookies.includes('remember_user_token')) {
    const $2 = load(r2.data);
    const err = $2('[class*="alert"],[class*="notice"],[class*="error"],[class*="flash"]').first().text().trim().slice(0,300);
    console.log('page title:', $2('title').text().trim());
    console.log('alert text:', err||'(none found)');
    const m = r2.data.match(/(二段階|2段階|two.factor|OTP|verification|confirm|認証コード|メールを送|phone|電話)/i);
    console.log('2FA/verify hint:', m?.[0]||'(none)');
    return;
  }

  console.log('\n✅ Login OK!');
  console.log('\nStep3: GET /articles/new');
  const r3 = await axios.get(BASE+'/articles/new', {
    headers:{'User-Agent':UA,Cookie:cookies,'Accept':'text/html,application/xhtml+xml'},
    maxRedirects:5, validateStatus:s=>true
  });
  console.log('articles/new status:', r3.status);
  const $3 = load(r3.data);
  console.log('page title:', $3('title').text().trim());
  console.log('has form csrf:', !!$3('input[name="authenticity_token"]').first().val());
  if (r3.status !== 200) {
    console.log('body[0:500]:', r3.data.slice(0,500));
  }
}

run().catch(e => console.error('FATAL:', e.message, e.response?.status));
