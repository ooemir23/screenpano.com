// Tüm ortam ayarları tek yerde. Ürün adı ve alan adı buradan değişir.
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');

module.exports = {
  ROOT,
  DATA_DIR,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  PORT: Number(process.env.PORT) || 3000,
  TZ: process.env.TZ_NAME || 'Europe/Istanbul',
  // Ürün adı: TV menüsünde, panelde ve Başlangıç paketindeki köşe ibaresinde görünür
  BRAND: process.env.BRAND_NAME || 'ScreenPano',
  // Süper yönetici: ilk açılışta yoksa oluşturulur (şifreyi mutlaka değiştirin)
  SUPER_USER: process.env.SUPER_USER || 'admin',
  SUPER_PASS: process.env.SUPER_PASS || '',
  // İşletmeler kendi kendine kayıt olabilsin mi (14 gün deneme ile)
  ALLOW_SIGNUP: process.env.ALLOW_SIGNUP !== 'false',
  TRIAL_DAYS: Number(process.env.TRIAL_DAYS) || 14,
  // Oturum imzası için gizli anahtar; verilmezse veritabanında üretilip saklanır
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  FFMPEG: process.env.FFMPEG_PATH || 'ffmpeg',
  CHROMIUM: process.env.CHROMIUM_PATH || 'chromium',
  PHARM_BASE: process.env.PHARMACY_BASE || 'https://api.collectapi.com',
};
