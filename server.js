const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => {
  console.log(`✅ منصة "درع" لتقييم الجاهزية السيبرانية تعمل على: http://localhost:${PORT}`);
  console.log(`   لوحة الإدارة: http://localhost:${PORT}/#/login`);
  console.log('   الحساب الافتراضي (أول تشغيل): admin / Admin@12345 — غيّره من صفحة الإعدادات');
});
