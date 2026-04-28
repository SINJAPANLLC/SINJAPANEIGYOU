const BASE = 'https://jmty.jp';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const { default: axios } = await import('axios');
const { load } = await import('cheerio');

const r1 = await axios.get(BASE+'/users/sign_in', {
  headers:{'User-Agent':UA,'Accept':'text/html,application/xhtml+xml'},
  maxRedirects:5
});
const $ = load(r1.data);

// フォームの全フィールドを出力
console.log('=== ログインフォームのフィールド ===');
$('form').each((i, form) => {
  const action = $(form).attr('action');
  const method = $(form).attr('method');
  if (action && action.includes('sign')) {
    console.log(`Form action=${action} method=${method}`);
    $(form).find('input').each((j, inp) => {
      const name = $(inp).attr('name');
      const type = $(inp).attr('type');
      const val = $(inp).attr('value');
      console.log(`  input: name=${name} type=${type} value=${type==='password'?'***':(val||'').slice(0,30)}`);
    });
  }
});
