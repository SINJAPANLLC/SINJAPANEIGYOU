import test from "node:test";
import assert from "node:assert/strict";
import { auditEmail } from "./email-renderer";
import { renderEmail } from "./email-renderer";
import { buildUnsubscribeUrl } from "./unsubscribe-url";

const original = {
  APP_URL: process.env.APP_URL,
  REPLIT_DEPLOYMENT_DOMAIN: process.env.REPLIT_DEPLOYMENT_DOMAIN,
  REPLIT_DOMAINS: process.env.REPLIT_DOMAINS,
  REPLIT_DEV_DOMAIN: process.env.REPLIT_DEV_DOMAIN,
};

function reset() {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test.afterEach(reset);

test("APP_URLを優先して絶対配信停止URLを生成する", () => {
  process.env.APP_URL = "https://app.example.com/base/";
  process.env.REPLIT_DOMAINS = "fallback.example.com";
  assert.equal(buildUnsubscribeUrl("a/b"), "https://app.example.com/base/api/unsubscribe/a%2Fb");
});

test("デプロイドメイン、Replitドメイン、開発ドメインの順に解決する", () => {
  delete process.env.APP_URL;
  process.env.REPLIT_DEPLOYMENT_DOMAIN = "deployed.example.com";
  assert.equal(buildUnsubscribeUrl("token"), "https://deployed.example.com/api/unsubscribe/token");

  delete process.env.REPLIT_DEPLOYMENT_DOMAIN;
  process.env.REPLIT_DOMAINS = "first.example.com,second.example.com";
  assert.equal(buildUnsubscribeUrl("token"), "https://first.example.com/api/unsubscribe/token");

  delete process.env.REPLIT_DOMAINS;
  process.env.REPLIT_DEV_DOMAIN = "dev.example.com";
  assert.equal(buildUnsubscribeUrl("token"), "https://dev.example.com/api/unsubscribe/token");
});

test("設定がなければ相対URLやlocalhostへ黙ってフォールバックしない", () => {
  delete process.env.APP_URL;
  delete process.env.REPLIT_DEPLOYMENT_DOMAIN;
  delete process.env.REPLIT_DOMAINS;
  delete process.env.REPLIT_DEV_DOMAIN;
  assert.throws(() => buildUnsubscribeUrl("token"));
});

test("生成URLを含む完成メールだけが監査を通過する", () => {
  process.env.APP_URL = "https://app.example.com";
  const unsubscribeUrl = buildUnsubscribeUrl("valid-token");
  assert.equal(auditEmail(
    "ご案内",
    `<p>詳細は<a href="https://service.example.com">こちら</a></p><a href="${unsubscribeUrl}">配信停止</a>`,
  ).valid, true);
  assert.equal(auditEmail("{{company_name}}様", "<p>本文</p>").valid, false);
});

test("外部由来の差し込み値をHTMLとして実行可能にしない", () => {
  const rendered = renderEmail(
    "{{company_name}}様",
    '<p>{{company_name}}</p><a href="{{service_url}}">詳細</a><a href="{{unsubscribe_url}}">停止</a>',
    {
      companyName: '<img src=x onerror="alert(1)">',
      serviceName: "安全なサービス",
      serviceUrl: 'https://example.com/?q=" onclick="alert(1)',
      unsubscribeUrl: "https://app.example.com/api/unsubscribe/token",
    },
  );
  assert.doesNotMatch(rendered.html, /<img|href="[^"]*"\s+onclick=/);
  assert.match(rendered.html, /&lt;img/);
  assert.doesNotMatch(rendered.subject, /[\r\n]/);
});

test("スクリプトURLをメールリンクへ差し込まない", () => {
  const rendered = renderEmail(
    "ご案内",
    '<a href="{{service_url}}">詳細</a><a href="{{unsubscribe_url}}">停止</a>',
    {
      companyName: "テスト企業",
      serviceName: "サービス",
      serviceUrl: "javascript:alert(1)",
      unsubscribeUrl: "https://app.example.com/api/unsubscribe/token",
    },
  );
  assert.doesNotMatch(rendered.html, /javascript:/i);
});