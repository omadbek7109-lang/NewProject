/* FLECT STARS — ochiq sozlamalar.
 * Bu yerga FAQAT ochiq (publishable / anon) kalit yoziladi. U brauzerda ko'rinishi
 * normal: u bilan faqat mahsulotlarni o'qish mumkin (RLS).
 * service_role / secret kalitni HECH QACHON bu faylga yozmang.
 */
window.FLECT_CONFIG = {
  // Supabase: Project Settings -> API
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseKey: "YOUR-PUBLISHABLE-OR-ANON-KEY",
  // Mijoz buyurtma xabarini yuboradigan Telegram akkaunt
  adminUsername: "flect_stars"
};
 
