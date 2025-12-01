// test_canvas.js
const QRCode = require('qrcode');
const fs = require('fs').promises;

async function testCanvas() {
  try {
    // Intentar cargar canvas
    const { createCanvas, loadImage } = require('canvas');
    console.log('✅ Canvas cargado correctamente');
    
    // Probar creación de canvas
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');
    
    // Dibujar algo simple
    ctx.fillStyle = 'blue';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText('Canvas funciona!', 10, 100);
    
    // Guardar imagen de prueba
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile('test_canvas.png', buffer);
    console.log('✅ Imagen de prueba guardada como test_canvas.png');
    
    // Probar QR con canvas
    await testQRConCanvas();
    
  } catch (error) {
    console.log('❌ Error con canvas:', error.message);
    console.log('⚠️  Usando QR simple sin títulos');
    await testQRSimple();
  }
}

async function testQRConCanvas() {
  const { createCanvas, loadImage } = require('canvas');
  const QRCode = require('qrcode');
  
  const qrSize = 300;
  const padding = 40;
  const fontSize = 24;
  const canvasWidth = qrSize + padding * 2;
  const canvasHeight = qrSize + padding * 3 + fontSize;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fondo blanco
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Título
  ctx.fillStyle = 'black';
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('QR DE PRUEBA', canvasWidth / 2, padding + fontSize / 2);

  // Generar QR
  const qrDataUrl = await QRCode.toDataURL('https://ejemplo.com', { 
    width: qrSize,
    margin: 1
  });
  
  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, padding, padding + fontSize + 10, qrSize, qrSize);

  // Guardar
  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile('test_qr_con_titulo.png', buffer);
  console.log('✅ QR con título guardado como test_qr_con_titulo.png');
}

async function testQRSimple() {
  // Generar QR simple sin canvas
  await QRCode.toFile('test_qr_simple.png', 'https://ejemplo.com', {
    width: 300,
    margin: 1
  });
  console.log('✅ QR simple guardado como test_qr_simple.png');
}

// Ejecutar prueba
testCanvas();