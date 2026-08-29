import assert from "node:assert/strict";
import test from "node:test";
import { describeXResearchError } from "./x-research-error";

test("残高不足が明記された場合だけクレジット不足と判定する", () => {
  const failure = describeXResearchError({
    code: 402,
    data: { detail: "Credits depleted for this project" },
  });
  assert.equal(failure.message, "X APIクレジット残高不足");
});

test("詳細不明の402を残高不足と断定しない", () => {
  const failure = describeXResearchError({
    code: 402,
    data: { detail: "Payment Required" },
  });
  assert.equal(failure.message, "X APIの請求またはProject利用設定エラー");
  assert.equal(failure.detail, "Payment Required");
});

test("ネストされたX APIエラーの詳細を取得する", () => {
  const failure = describeXResearchError({
    code: 402,
    data: { errors: [{ title: "Project billing is not enabled" }] },
  });
  assert.equal(failure.message, "X APIの請求またはProject利用設定エラー");
  assert.equal(failure.detail, "Project billing is not enabled");
});