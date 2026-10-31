// deno test supabase/functions/tests/
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { InitDataError, signInitData, validateInitData } from "../_shared/telegram.ts";
import { customerNotice } from "../admin-api/handler.ts";
import { orderLink } from "../api/handler.ts";
import { isAdmin } from "../_shared/config.ts";

const TOKEN = "123456:TEST-token";
const NOW = 1_800_000_000;

async function make(fields: Record<string, string>, token = TOKEN): Promise<string> {
  const hash = await signInitData(fields, token);
  return new URLSearchParams({ ...fields, hash }).toString();
}

const base = () => ({
  auth_date: String(NOW - 100),
  query_id: "AAH",
  signature: "sig-ed25519",
  user: JSON.stringify({ id: 7550418397, first_name: "Admin", username: "boss" }),
});

Deno.test("to'g'ri initData qabul qilinadi", async () => {
  const d = await validateInitData(await make(base()), TOKEN, 86400, NOW);
  assertEquals(d.user.id, 7550418397);
  assertEquals(d.authDate, NOW - 100);
});

Deno.test("Telegram hujjatidagi tartib: kalitlar alifbo bo'yicha, hash chiqarib tashlanadi", async () => {
  // Qo'lda hisoblangan data_check_string bilan bir xil natija
  const f = { b: "2", a: "1", hash: "x" };
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const secret = await crypto.subtle.sign("HMAC", k1, enc.encode(TOKEN));
  const k2 = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k2, enc.encode("a=1\nb=2")));
  const hex = Array.from(sig, (x) => x.toString(16).padStart(2, "0")).join("");
  assertEquals(await signInitData(f, TOKEN), hex);
});

Deno.test("boshqa bot tokeni bilan imzolangan initData rad etiladi", async () => {
  const raw = await make(base(), "999:OTHER");
  await assertRejects(() => validateInitData(raw, TOKEN, 86400, NOW), InitDataError, "tasdiqlanmadi");
});

Deno.test("user o'zgartirilsa (admin ID ga almashtirilsa) rad etiladi", async () => {
  const f = { ...base(), user: JSON.stringify({ id: 111, first_name: "Ali" }) };
  const raw = await make(f);
  const forged = raw.replace(encodeURIComponent('"id":111'), encodeURIComponent('"id":7550418397'));
  await assertRejects(() => validateInitData(forged, TOKEN, 86400, NOW), InitDataError);
});

Deno.test("eskirgan initData rad etiladi", async () => {
  const raw = await make({ ...base(), auth_date: String(NOW - 90000) });
  const e = await assertRejects(() => validateInitData(raw, TOKEN, 86400, NOW), InitDataError);
  assertEquals((e as InitDataError).code, "init_data_expired");
});

Deno.test("kelajakdagi auth_date rad etiladi", async () => {
  const raw = await make({ ...base(), auth_date: String(NOW + 3600) });
  await assertRejects(() => validateInitData(raw, TOKEN, 86400, NOW), InitDataError);
});

Deno.test("hash yo'q / bo'sh / takroriy kalit rad etiladi", async () => {
  await assertRejects(() => validateInitData("", TOKEN, 86400, NOW), InitDataError);
  await assertRejects(() => validateInitData(null, TOKEN, 86400, NOW), InitDataError);
  await assertRejects(() => validateInitData("auth_date=1&user=%7B%7D", TOKEN, 86400, NOW), InitDataError);
  const raw = await make(base());
  await assertRejects(() => validateInitData(raw + "&auth_date=1", TOKEN, 86400, NOW), InitDataError);
});

Deno.test("user.id noto'g'ri bo'lsa rad etiladi", async () => {
  for (const user of ['{"id":"7550418397"}', '{"id":-1}', "null", "not-json", '{"id":1.5}']) {
    const raw = await make({ ...base(), user });
    await assertRejects(() => validateInitData(raw, TOKEN, 86400, NOW), InitDataError);
  }
});

Deno.test("admin faqat 7550418397", () => {
  assertEquals(isAdmin(7550418397), true);
  assertEquals(isAdmin("7550418397"), true);
  assertEquals(isAdmin(755041839), false);
  assertEquals(isAdmin(75504183970), false);
  assertEquals(isAdmin(1), false);
});

Deno.test("buyurtma havolasi va mijoz xabari", () => {
  const link = orderLink("flect_stars", {
    order: {
      id: "x",
      code: "FS-ABCDEF12",
      status: "new",
      product_title: "50 Stars",
      quantity: 1,
      unit_price: 12000,
      total_price: 12000,
    },
    message_name: "50 Stars",
    customer: { id: 1, username: null, first_name: null, last_name: null },
  });
  assertEquals(
    decodeURIComponent(link.split("?text=")[1]),
    "Assalomu alaykum, menga 50 Stars kerak! Narxi: 12 000 so'm. Buyurtma kodi: FS-ABCDEF12",
  );
  const o = { id: "x", code: "FS-1", user_id: 1, product_title: "P", quantity: 1, cancel_reason: "test" };
  assertEquals(customerNotice({ ...o, status: "new" }), null);
  assertEquals(customerNotice({ ...o, status: "cancelled" })?.includes("Sabab: test"), true);
});
