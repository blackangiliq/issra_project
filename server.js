const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => {
  console.log(`✅ منصة تقييم الجاهزية السيبرانية تعمل على: http://localhost:${PORT}`);
});
